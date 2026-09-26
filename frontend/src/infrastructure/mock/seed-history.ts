import type {
  Attendance,
  AttendanceType,
  WorkSchedule,
} from "@/core/domain/attendance";
import { isWorkDay } from "@/core/domain/attendance";
import { evaluateCheckIn, evaluateCheckOut } from "@/core/usecase/attendance-status";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import type { AuditLog, WorkRequest } from "@/core/domain/requests";
import { SEED_CONFIG, type StoredUser } from "@/infrastructure/mock/seed-users";

/** Data awal lengkap penyimpanan contoh. */
export interface SeedData {
  enrollments: FaceEnrollment[];
  attendance: Attendance[];
  requests: WorkRequest[];
  auditLogs: AuditLog[];
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tanggalISO0(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Buat satu transaksi presensi contoh untuk seorang pengguna. Statusnya dihitung
 * oleh aturan jadwal yang sama dengan presensi sungguhan (`evaluateCheckIn` /
 * `evaluateCheckOut`), jadi riwayat contoh tidak pernah bertentangan dengan
 * jadwal yang sedang berlaku.
 */
function buatPresensi(
  user: StoredUser,
  tanggal: Date,
  jenis: AttendanceType,
  variasi: number,
  schedule: WorkSchedule,
): Attendance {
  const isCheckIn = jenis === "CHECK_IN";
  const menit = isCheckIn
    ? 7 * 60 + 25 + (variasi % 45) // 07.25 – 08.09 (datang lebih awal s.d. terlambat)
    : 15 * 60 + 50 + (variasi % 70); // 15.50 – 16.59 (pulang cepat s.d. tepat waktu)
  const at = new Date(tanggal);
  at.setHours(Math.floor(menit / 60), menit % 60, 20 + (variasi % 30), 0);
  const hasilEvaluasi = isCheckIn
    ? evaluateCheckIn(schedule, at)
    : evaluateCheckOut(schedule, at);
  // Selisih contoh memakai aturan yang sama (tak pernah bertentangan),
  // supaya mock berperilaku seperti backend yang menyimpan selisih.
  const selisihSimpan =
    hasilEvaluasi.status === "TERLAMBAT" ||
    hasilEvaluasi.status === "PULANG_CEPAT" ||
    hasilEvaluasi.status === "LEBIH_KERJA"
      ? hasilEvaluasi.deltaMinutes
      : 0;
  return {
    id: `seed-${user.id}-${tanggalISO0(tanggal)}-${jenis}`,
    userId: user.id,
    userName: user.fullName,
    type: jenis,
    mode: variasi % 11 === 0 ? "WFH" : variasi % 17 === 0 ? "DINAS_LUAR" : "WFO",
    status: hasilEvaluasi.status,
    selisihMenit: selisihSimpan,
    office: { id: SEED_CONFIG.office.id, name: SEED_CONFIG.office.name },
    verification: {
      faceMatch: true,
      faceScore: 0.78 + (variasi % 15) / 100,
      liveness: true,
      livenessScore: 0.82 + (variasi % 10) / 100,
      geofence: {
        verdict: "INSIDE",
        distanceMeters: SEED_CONFIG.demoUserDistanceMeters + (variasi % 40),
        accuracyMeters: 8 + (variasi % 20),
      },
      serverTime: at.toISOString(),
    },
  };
}

/** Riwayat presensi 30 hari terakhir, pengajuan, pendaftaran, dan audit awal. */
export function buatRiwayatAwal(
  users: StoredUser[],
  schedule: WorkSchedule = SEED_CONFIG.schedule,
): SeedData {
  const kini = new Date();
  const attendance: Attendance[] = [];

  for (let hariLalu = 1; hariLalu <= 30; hariLalu++) {
    const tanggal = new Date(kini);
    tanggal.setDate(kini.getDate() - hariLalu);
    if (!isWorkDay(schedule, tanggal)) continue; // hari libur menurut jam kerja

    for (const user of users) {
      // Akun yang belum diaktivasi/nonaktif belum berjalan sebagai perangkat,
      // jadi tidak diberi riwayat presensi.
      if (user.accountStatus !== "AKTIF") continue;
      const variasi = hash(user.id + tanggalISO0(tanggal)) % 97;
      // Sekitar 1 dari 9 hari perangkat tidak hadir (izin/sakit/dinas).
      if (variasi % 9 === 4 && user.role === "PERANGKAT_DESA") continue;
      attendance.push(buatPresensi(user, tanggal, "CHECK_IN", variasi, schedule));
      attendance.push(buatPresensi(user, tanggal, "CHECK_OUT", variasi, schedule));
    }
  }

  const iso = (d: Date) => d.toISOString();
  const besok = new Date(kini);
  besok.setDate(kini.getDate() + 1);
  const lusa = new Date(besok);
  lusa.setDate(besok.getDate() + 1);

  const requests: WorkRequest[] = [
    {
      id: "req-1",
      type: "WFH",
      userId: "u-ahmad",
      userName: "Ahmad Fauzan",
      startDate: tanggalISO0(besok),
      endDate: tanggalISO0(besok),
      reason:
        "Menyelesaikan laporan bulanan dari rumah karena jaringan kantor sedang diperbaiki.",
      status: "MENUNGGU",
      createdAt: iso(kini),
    },
    {
      id: "req-2",
      type: "IZIN",
      userId: "u-dewi",
      userName: "Dewi Lestari",
      startDate: tanggalISO0(lusa),
      endDate: tanggalISO0(lusa),
      reason: "Mengurus dokumen keluarga di kecamatan.",
      status: "MENUNGGU",
      createdAt: iso(kini),
    },
    {
      id: "req-3",
      type: "DINAS_LUAR",
      userId: "u-ahmad",
      userName: "Ahmad Fauzan",
      startDate: tanggalISO0(kini),
      endDate: tanggalISO0(kini),
      reason: "Rapat koordinasi pembangunan di Kantor Camat Barru.",
      status: "DISETUJUI",
      createdAt: iso(new Date(kini.getTime() - 86_400_000)),
      decidedAt: iso(new Date(kini.getTime() - 43_200_000)),
      decidedByName: "H. Abdul Malik",
      decisionNote: "Sertakan notulen rapat.",
    },
    {
      id: "req-4",
      type: "CUTI",
      userId: "u-dewi",
      userName: "Dewi Lestari",
      startDate: "2026-08-03",
      endDate: "2026-08-05",
      reason: "Cuti tahunan.",
      status: "DISETUJUI",
      createdAt: "2026-07-28T02:00:00.000Z",
      decidedAt: "2026-07-28T05:30:00.000Z",
      decidedByName: "H. Abdul Malik",
    },
  ];

  const enrollments: FaceEnrollment[] = [
    {
      id: "enr-1",
      userId: "u-siti",
      userName: "Siti Aisyah",
      status: "SUBMITTED",
      photos: [],
      submittedAt: iso(new Date(kini.getTime() - 3_600_000)),
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: "aud-1",
      at: iso(new Date(kini.getTime() - 43_200_000)),
      actorId: "u-kepala",
      actorName: "H. Abdul Malik",
      action: "MENYETUJUI_PENGAJUAN",
      targetType: "WorkRequest",
      targetId: "req-3",
      detail: "Dinas luar Ahmad Fauzan disetujui.",
    },
    {
      id: "aud-2",
      at: iso(new Date(kini.getTime() - 3_600_000)),
      actorId: "u-siti",
      actorName: "Siti Aisyah",
      action: "MENGIRIM_PENDAFTARAN_WAJAH",
      targetType: "FaceEnrollment",
      targetId: "enr-1",
      detail: "Foto wajah dikirim untuk verifikasi admin.",
    },
  ];

  return { enrollments, attendance, requests, auditLogs };
}
