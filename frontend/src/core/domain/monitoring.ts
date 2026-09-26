/**
 * Ringkasan monitoring harian — dihitung di inti aplikasi dari API fitur
 * (daftar pengguna, presensi satu tanggal, pengajuan disetujui); tidak ada
 * endpoint khusus dashboard di backend.
 */

/** Perangkat yang pada tanggal yang dipantau tidak presensi tanpa keterangan. */
export interface PerangkatTanpaKeterangan {
  readonly userId: string;
  readonly userName: string;
  readonly position: string;
}

export interface RingkasanMonitoring {
  /** Tanggal ringkasan (ISO date). */
  readonly date: string;
  readonly totalPerangkat: number;
  readonly hadir: number;
  /** Belum presensi padahal batas masuknya masih tersisa. */
  readonly belumPresensi: number;
  /**
   * Hari kerja yang batas masuknya sudah lewat tanpa presensi masuk dan tanpa
   * pengajuan yang menjelaskan (izin/sakit/cuti disetujui). Inilah angka yang
   * menjawab "siapa yang tidak melakukan presensi".
   */
  readonly tanpaKeterangan: number;
  readonly terlambat: number;
  readonly wfh: number;
  readonly dinasLuar: number;
  readonly izinSakitCuti: number;
  /** Apakah tanggal yang dipantau hari kerja menurut jadwal yang berlaku. */
  readonly hariKerja: boolean;
  /** Apakah kewajiban presensi tanggal itu sudah tutup buku. */
  readonly tutupBuku: boolean;
  readonly daftarTanpaKeterangan: readonly PerangkatTanpaKeterangan[];
}
