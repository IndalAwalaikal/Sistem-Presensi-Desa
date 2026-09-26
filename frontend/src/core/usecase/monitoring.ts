import type { AttendanceListItem, WorkSchedule } from "@/core/domain/attendance";
import type {
  PerangkatTanpaKeterangan,
  RingkasanMonitoring,
} from "@/core/domain/monitoring";
import type { WorkRequest } from "@/core/domain/requests";
import { menutupKehadiran } from "@/core/domain/requests";
import type { User } from "@/core/domain/user";
import { isHariKerjaEfektifIso, lewatBatasMasuk } from "@/core/usecase/kehadiran";
import { tanggalISO } from "@/lib/waktu";

/** Bahan mentah ringkasan monitoring — seluruhnya dari API fitur. */
export interface BahanMonitoring {
  /** Tanggal ringkasan (ISO date). */
  readonly tanggal: string;
  readonly pengguna: readonly User[];
  /** Presensi tanggal tersebut (GET /api/admin/presensi?tanggal=). */
  readonly presensi: readonly AttendanceListItem[];
  /** Pengajuan yang sudah disetujui (GET /api/admin/pengajuan?status=DISETUJUI). */
  readonly pengajuan: readonly WorkRequest[];
  /** Jadwal yang berlaku — menentukan hari kerja & batas masuk. */
  readonly jadwal: WorkSchedule;
  /**
   * Tanggal ISO hari libur (nasional, cuti bersama, lokal). Hari libur tidak
   * menuntut presensi, jadi tanggal itu tidak pernah menghasilkan "tanpa
   * keterangan". Kosong = kalender belum dimuat → hanya akhir pekan yang
   * dikecualikan.
   */
  readonly libur?: ReadonlySet<string>;
  /** Waktu resmi (server) saat ringkasan disusun. */
  readonly sekarang: Date;
}

/**
 * Ringkasan monitoring satu tanggal. Agregat dihitung di inti aplikasi dari
 * API fitur (pengguna, presensi, pengajuan) — backend tidak menyediakan
 * endpoint khusus dashboard.
 *
 * Yang membedakan "belum presensi" dari "tanpa keterangan" adalah batas masuk:
 * sebelum batas masuk lewat, perangkat yang belum presensi masih dapat mengisi
 * presensi hari itu (belum presensi); setelahnya, yang tidak punya presensi
 * masuk dan tidak punya pengajuan izin/sakit/cuti dihitung tanpa keterangan.
 */
export function ringkasMonitoring(bahan: BahanMonitoring): RingkasanMonitoring {
  const { tanggal, pengguna, presensi, pengajuan, jadwal, libur, sekarang } = bahan;
  const aktif = pengguna.filter((u) => u.accountStatus === "AKTIF");

  const checkIn = presensi.filter((a) => a.type === "CHECK_IN");
  const hadirIds = new Set(checkIn.map((a) => a.userId));
  const terlambat = checkIn.filter((a) => a.status === "TERLAMBAT").length;

  // Pengajuan yang menggulung (menutup) tanggal tersebut.
  const menggulung = pengajuan.filter(
    (r) =>
      r.status === "DISETUJUI" &&
      r.startDate <= tanggal &&
      r.endDate >= tanggal,
  );
  const izinIds = new Set(
    menggulung
      .filter((r) => menutupKehadiran(r.type))
      .map((r) => r.userId),
  );
  const hitung = (tipe: WorkRequest["type"]) =>
    menggulung.filter((r) => r.type === tipe).length;

  const hadir = [...hadirIds].filter((id) => !izinIds.has(id)).length;
  const izin = izinIds.size;

  // Kewajiban presensi hanya ada pada hari kerja efektif yang sudah/sedang
  // berjalan — akhir pekan, hari libur, dan tanggal yang akan datang tidak
  // menuntut apa pun.
  const hariIni = tanggalISO(sekarang);
  const kewajibanAda = isHariKerjaEfektifIso(jadwal, libur, tanggal) && tanggal <= hariIni;
  const tutupBuku =
    kewajibanAda && (tanggal < hariIni || lewatBatasMasuk(jadwal, sekarang));
  const absen = aktif.filter((u) => !hadirIds.has(u.id) && !izinIds.has(u.id));
  const daftarTanpaKeterangan: PerangkatTanpaKeterangan[] = tutupBuku
    ? absen.map((u) => ({
        userId: u.id,
        userName: u.fullName,
        position: u.official.position,
      }))
    : [];

  return {
    date: tanggal,
    totalPerangkat: aktif.length,
    hariKerja: kewajibanAda,
    tutupBuku,
    hadir,
    belumPresensi: kewajibanAda && !tutupBuku ? absen.length : 0,
    tanpaKeterangan: daftarTanpaKeterangan.length,
    terlambat,
    wfh: hitung("WFH"),
    dinasLuar: hitung("DINAS_LUAR"),
    izinSakitCuti: izin,
    daftarTanpaKeterangan,
  };
}
