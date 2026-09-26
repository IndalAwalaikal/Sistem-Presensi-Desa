/**
 * Kalender hari libur desa: libur nasional, cuti bersama, dan libur lokal.
 * Murni TypeScript — tanpa dependensi framework (lapisan domain).
 *
 * Hari libur **meniadakan kewajiban presensi** tanpa melarang presensi itu
 * sendiri: perhitungan tanpa keterangan, monitoring harian, rekap bulanan, dan
 * kalender riwayat semuanya mengecualikan tanggal libur — paralel dengan
 * `domain.KalenderLibur` backend. Perangkat yang tetap bekerja di hari libur
 * tetap dapat presensi dan catatannya tersimpan seperti biasa.
 */

export const JENIS_LIBUR = ["LIBUR_NASIONAL", "CUTI_BERSAMA", "LIBUR_LOKAL"] as const;
export type JenisLibur = (typeof JENIS_LIBUR)[number];

export const JENIS_LIBUR_LABEL: Record<JenisLibur, string> = {
  LIBUR_NASIONAL: "Libur nasional",
  CUTI_BERSAMA: "Cuti bersama",
  LIBUR_LOKAL: "Libur lokal",
};

export const SUMBER_LIBUR = ["SKB", "IMPOR", "MANUAL"] as const;
export type SumberLibur = (typeof SUMBER_LIBUR)[number];

/**
 * Asal catatan libur, seperti terbaca pengelola akun. Bedanya penting bagi
 * kebijakan penarikan ulang: catatan "ditetapkan desa" adalah keputusan
 * pengelola akun, jadi tidak pernah ditimpa kalender resmi.
 */
export const SUMBER_LIBUR_LABEL: Record<SumberLibur, string> = {
  SKB: "Bawaan SKB",
  IMPOR: "Tarik sumber resmi",
  MANUAL: "Ditetapkan desa",
};

/** Satu tanggal libur menurut kalender WITA (ISO "YYYY-MM-DD"). */
export interface HariLibur {
  readonly tanggal: string;
  readonly nama: string;
  readonly jenis: JenisLibur;
  readonly sumber: SumberLibur;
}

/** Himpunan hari libur untuk pemeriksaan per tanggal. */
export function kalenderLibur(hari: readonly HariLibur[]): Set<string> {
  return new Set(hari.filter((h) => tanggalSah(h.tanggal)).map((h) => h.tanggal));
}

/** Apakah tanggal ISO itu hari libur. Aman untuk kalender kosong (`undefined`). */
export function isHariLibur(libur: ReadonlySet<string> | undefined, iso: string): boolean {
  return libur?.has(iso) ?? false;
}

/**
 * Apakah `iso` tanggal "YYYY-MM-DD" yang benar-benar ada di kalender.
 *
 * Pemeriksaan ini dipakai sebelum menghitung hari kerja: tanggal yang meleset
 * (mis. "2026-02-30") tidak boleh lolos menjadi hari libur, karena satu tanggal
 * keliru menghapus kewajiban presensi sehari — atau sebaliknya, membuat
 * perangkat tercatat tanpa keterangan padahal kantor buka.
 */
export function tanggalSah(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const tahun = Number(m[1]);
  const bulan = Number(m[2]);
  const hari = Number(m[3]);
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  return (
    d.getUTCFullYear() === tahun &&
    d.getUTCMonth() === bulan - 1 &&
    d.getUTCDate() === hari
  );
}

/** Tahun dari tanggal ISO; `null` bila tanggalnya tidak sah. */
export function tahunDariIso(iso: string): number | null {
  return tanggalSah(iso) ? Number(iso.slice(0, 4)) : null;
}

/** Peta tanggal → catatan libur, untuk penanda pada kalender riwayat. */
export function petaNamaLibur(hari: readonly HariLibur[]): Map<string, HariLibur> {
  const hasil = new Map<string, HariLibur>();
  for (const h of hari) {
    if (tanggalSah(h.tanggal)) hasil.set(h.tanggal, h);
  }
  return hasil;
}

/** Cacah hari libur per jenis, untuk ringkasan satu tahun pada layar kalender. */
export function hitungJenis(hari: readonly HariLibur[]): Record<JenisLibur, number> {
  const hasil: Record<JenisLibur, number> = {
    LIBUR_NASIONAL: 0,
    CUTI_BERSAMA: 0,
    LIBUR_LOKAL: 0,
  };
  for (const h of hari) {
    if (tanggalSah(h.tanggal)) hasil[h.jenis] += 1;
  }
  return hasil;
}
