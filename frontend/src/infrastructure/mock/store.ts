import type { Attendance, OfficeLocation, WorkSchedule, JadwalKhusus } from "@/core/domain/attendance";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import type { HariLibur } from "@/core/domain/libur";
import type { AuditLog, WorkRequest } from "@/core/domain/requests";
import type { Undangan } from "@/core/domain/undangan";
import { SEED_HARI_LIBUR } from "@/infrastructure/mock/seed-libur";
import { buatRiwayatAwal } from "@/infrastructure/mock/seed-history";
import {
  SEED_CONFIG,
  SEED_USERS,
  undanganAwal,
  type StoredUser,
} from "@/infrastructure/mock/seed-users";

/**
 * Penyimpanan contoh: state di memori + cermin ke localStorage pada browser.
 * Lapisan presentasi tidak boleh mengakses modul ini secara langsung —
 * semuanya melalui pintu (gateway) di core/ports.
 *
 * Kunci versi dinaikkan saat bentuk data berubah (kini v6: kalender hari libur
 * ikut tersimpan; v5 lokasi kantor juga konfigurasi; v4 menjadikan jam kerja
 * konfigurasi; v3 menyederhanakan peran) supaya data contoh lama tidak terbaca
 * sebagai data baru yang tidak lengkap.
 */

const KUNCI = "presensi-anabanua-v6";

export interface Simpanan {
  users: StoredUser[];
  undangan: Undangan[];
  enrollments: FaceEnrollment[];
  attendance: Attendance[];
  requests: WorkRequest[];
  auditLogs: AuditLog[];
  /** Jam kerja kantor yang sedang berlaku — diubah lewat /jadwal. */
  schedule: WorkSchedule;
  /** Lokasi kantor (geofence) yang sedang berlaku — diubah lewat /jadwal. */
  office: OfficeLocation;
  /** Kalender hari libur desa — diubah lewat /hari-libur. */
  hariLibur: HariLibur[];
  /** Jadwal khusus (Ramadan, shift) */
  jadwalKhusus: JadwalKhusus[];
  sessionUserId: string | null;
}

function dataSegar(): Simpanan {
  return {
    users: SEED_USERS.map((u) => ({ ...u, official: { ...u.official } })),
    undangan: undanganAwal(),
    enrollments: [],
    attendance: [],
    requests: [],
    auditLogs: [],
    schedule: salinanJadwalAwal(),
    office: {
      ...SEED_CONFIG.office,
      point: { ...SEED_CONFIG.office.point },
    },
    hariLibur: SEED_HARI_LIBUR.map((h) => ({ ...h })),
    jadwalKhusus: [],
    sessionUserId: null,
  };
}

/** Salinan jadwal awal sebagai nilai yang bisa diubah (bukan `as const`). */
function salinanJadwalAwal(): WorkSchedule {
  return { ...SEED_CONFIG.schedule, workDays: [...SEED_CONFIG.schedule.workDays] };
}

let memori: Simpanan | null = null;

/** Muat data dari memori/localStorage; seed bila kosong. */
export function muat(): Simpanan {
  if (memori) return memori;

  if (typeof window !== "undefined") {
    try {
      const mentah = window.localStorage.getItem(KUNCI);
      if (mentah) {
        const parsed = JSON.parse(mentah) as Simpanan;
        if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
          parsed.undangan = Array.isArray(parsed.undangan) ? parsed.undangan : [];
          parsed.schedule = parsed.schedule ?? salinanJadwalAwal();
          parsed.office =
            parsed.office ??
            ({ ...SEED_CONFIG.office, point: { ...SEED_CONFIG.office.point } } as OfficeLocation);
          parsed.hariLibur = Array.isArray(parsed.hariLibur)
            ? parsed.hariLibur
            : SEED_HARI_LIBUR.map((h) => ({ ...h }));
          parsed.jadwalKhusus = Array.isArray(parsed.jadwalKhusus) ? parsed.jadwalKhusus : [];
          memori = parsed;
          return memori;
        }
      }
    } catch {
      // Data rusak — mulai dari seed.
    }
  }

  const awal = dataSegar();
  const riwayat = buatRiwayatAwal(awal.users, awal.schedule);
  memori = { ...awal, ...riwayat };
  simpan();
  return memori;
}

/** Simpan data ke memori dan (bila ada) localStorage. */
export function simpan(): void {
  if (!memori) return;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KUNCI, JSON.stringify(memori));
    } catch {
      // Kuota penuh — abaikan, state memori tetap berlaku.
    }
  }
}

/** Hapus semua data contoh dan mulai dari seed (untuk debugging). */
export function resetSimpanan(): void {
  memori = dataSegar();
  const riwayat = buatRiwayatAwal(memori.users, memori.schedule);
  memori = { ...memori, ...riwayat };
  simpan();
}
