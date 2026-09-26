import type {
  Attendance,
  AttendanceFilters,
  AttendanceType,
  OfficeLocation,
  PresensiResult,
  SubmitPresensiCommand,
  TodayStatus,
  WorkSchedule,
} from "@/core/ports/gateways";
import type { AttendanceMode } from "@/core/domain/attendance";
import { menutupKehadiran, modeTerbuka } from "@/core/domain/requests";
import type { AttendanceGateway } from "@/core/ports/gateways";
import { decidePresensi } from "@/core/usecase/presensi";
import { tanggalISO } from "@/lib/waktu";
import { SEED_CONFIG } from "@/infrastructure/mock/seed-users";
import { catatAudit, penggunaSession } from "@/infrastructure/mock/helpers";
import { muat, simpan } from "@/infrastructure/mock/store";
import { waktuServer } from "@/lib/waktu-server";

/** Label pengajuan yang menutup kehadiran — sama dengan label backend. */
const LABEL_MENUTUP: Record<string, string> = {
  IZIN: "Izin — disetujui",
  SAKIT: "Sakit — disetujui",
  CUTI: "Cuti — disetujui",
};

/** Pengajuan disetujui yang menggulung tanggal `kini`. */
function pengajuanHariIni(userId: string, kini: string) {
  return muat().requests.filter(
    (x) =>
      x.userId === userId &&
      x.status === "DISETUJUI" &&
      x.startDate <= kini &&
      x.endDate >= kini,
  );
}

/**
 * Status dari pengajuan yang berlaku hari ini — paralel `StatusHariIni` backend.
 *
 * Izin/sakit/cuti menutup kewajiban presensi (kind IZIN). WFH dan dinas luar
 * TIDAK: keduanya tetap wajib presensi, jadi yang dikembalikan adalah
 * BELUM_PRESENSI beserta `modeSaran` — bukan pintu yang terkunci.
 */
function statusPengajuanHariIni(userId: string, kini: string): TodayStatus {
  const hari = pengajuanHariIni(userId, kini);
  const menutup = hari.find((r) => menutupKehadiran(r.type));
  if (menutup) {
    return { kind: "IZIN", label: LABEL_MENUTUP[menutup.type] ?? "Izin — disetujui" };
  }
  let modeSaran: AttendanceMode | undefined;
  for (const r of hari) {
    const mode = modeTerbuka(r.type);
    if (mode && !modeSaran) modeSaran = mode;
  }
  return { kind: "BELUM_PRESENSI", modeSaran };
}

export const attendanceMock: AttendanceGateway = {
  async getTodayStatus(userId): Promise<TodayStatus> {
    const db = muat();
    const kini = tanggalISO(new Date());
    const milik = db.attendance.filter(
      (a) =>
        a.userId === userId &&
        tanggalISO(a.verification.serverTime) === kini,
    );
    const checkIn = milik.find((a) => a.type === "CHECK_IN");
    const checkOut = milik.find((a) => a.type === "CHECK_OUT");
    if (checkIn && checkOut) {
      return { kind: "SELESAI", checkIn, checkOut };
    }
    if (checkIn) return { kind: "SUDAH_CHECKIN", attendance: checkIn };
    return statusPengajuanHariIni(userId, kini);
  },

  async listMine(filters?: AttendanceFilters) {
    const user = penggunaSession();
    const db = muat();
    let hasil = db.attendance.filter((a) => a.userId === user.id);
    if (filters?.from) {
      hasil = hasil.filter(
        (a) => tanggalISO(a.verification.serverTime) >= filters.from!,
      );
    }
    if (filters?.to) {
      hasil = hasil.filter(
        (a) => tanggalISO(a.verification.serverTime) <= filters.to!,
      );
    }
    if (filters?.status) {
      hasil = hasil.filter((a) => a.status === filters.status);
    }
    return [...hasil].sort((a, b) =>
      b.verification.serverTime.localeCompare(a.verification.serverTime),
    );
  },

  async getActiveConfig() {
    const db = muat();
    return {
      office: { ...db.office, point: { ...db.office.point } } as OfficeLocation,
      schedule: { ...db.schedule, workDays: [...db.schedule.workDays] } as WorkSchedule,
      maxAccuracyMeters: SEED_CONFIG.maxAccuracyMeters,
    };
  },

  async submitPresensi(
    command: SubmitPresensiCommand & {
      faceScore: number;
      livenessScore: number;
    },
  ): Promise<PresensiResult> {
    return submitPresensi(command);
  },
};

/** Jenis presensi yang sudah tercatat hari ini oleh seorang pengguna. */
function sudahPresensiHariIni(userId: string, kini: Date): AttendanceType[] {
  const db = muat();
  const tanggal = tanggalISO(kini);
  return db.attendance
    .filter(
      (a) => a.userId === userId && tanggalISO(a.verification.serverTime) === tanggal,
    )
    .map((a) => a.type);
}

/** Jalankan keputusan presensi dan simpan bila diterima. */
export async function submitPresensi(command: {
  type: AttendanceType;
  mode: AttendanceMode;
  faceScore: number;
  livenessScore: number;
  location: { latitude: number; longitude: number };
  accuracyMeters: number;
}): Promise<PresensiResult> {
  const user = penggunaSession();
  const db = muat();
  const serverTime = waktuServer();
  // Mode WFH/dinas luar hanya sah bila pengajuannya disetujui hari ini —
  // aturan yang sama dengan backend, supaya mode kiriman layar tidak dapat
  // dipakai menghindari geofence tanpa dasar.
  const modeDisetujui = pengajuanHariIni(user.id, tanggalISO(serverTime))
    .map((r) => modeTerbuka(r.type))
    .filter((m): m is AttendanceMode => m !== null);
  const hasil = decidePresensi(command, {
    biometricStatus: user.biometricStatus,
    office: { ...db.office },
    schedule: { ...db.schedule, workDays: [...db.schedule.workDays] },
    maxAccuracyMeters: SEED_CONFIG.maxAccuracyMeters,
    serverTime,
    sudahPresensi: sudahPresensiHariIni(user.id, serverTime),
    modeDisetujui,
  });

  if (!hasil.accepted || !hasil.attendance || !hasil.verification) {
    return hasil;
  }

  const catatan: Attendance = {
    ...hasil.attendance,
    id: `att-${Date.now()}`,
    userId: user.id,
    userName: user.fullName,
  };
  db.attendance.push(catatan);
  catatAudit(
    user,
    command.type === "CHECK_IN" ? "CHECK_IN" : "CHECK_OUT",
    "Attendance",
    catatan.id,
    `${command.type} ${command.mode} — ${catatan.status} — ${Math.round(
      catatan.verification.geofence.distanceMeters,
    )} m dari kantor.`,
  );
  simpan();
  return { accepted: true, attendance: catatan, verification: catatan.verification };
}
