/**
 * Undangan aktivasi akun — alur registrasi perangkat desa baru (dokumen §6).
 * Murni TypeScript — tanpa dependensi framework (lapisan domain).
 *
 * Akun perangkat desa TIDAK dibuat sendiri oleh pengguna. Sekretaris atau kepala
 * desa yang membuat akun, lalu sistem menerbitkan kode undangan sekali pakai
 * yang diserahkan kepada orang yang bersangkutan. Kode itu dipakai sekali untuk
 * menetapkan kata sandi sendiri, melengkapi data yang boleh diisi sendiri, dan
 * mencatat persetujuan pemrosesan data wajah.
 */

/** Masa berlaku kode undangan sejak diterbitkan (hari). */
export const UNDANGAN_MASA_BERLAKU_HARI = 7;

export interface Undangan {
  /** Kode sekali pakai; dinormalkan ke huruf besar (lihat normalkanKode). */
  readonly kode: string;
  readonly userId: string;
  /** Nama & email disalin agar halaman aktivasi tahu undangan ini untuk siapa. */
  readonly nama: string;
  readonly email: string;
  readonly dibuatPada: string;
  readonly kedaluwarsaPada: string;
  /** Diisi saat kode dipakai — kode tidak dapat dipakai dua kali. */
  readonly dipakaiPada?: string;
}

/**
 * Normalkan kode yang diketik pengguna: buang spasi dan samakan huruf besar,
 * sehingga "anb-nurl-4821" tetap sah dibaca sebagai kode yang sama.
 */
export function normalkanKode(kode: string): string {
  return kode.replace(/\s+/g, "").toUpperCase();
}

export function undanganTerpakai(u: Undangan): boolean {
  return Boolean(u.dipakaiPada);
}

export function undanganKedaluwarsa(u: Undangan, sekarang: Date = new Date()): boolean {
  // Inklusif (`<=`): pada milidetik tepatnya kode sudah gugur — penting agar
  // kode yang baru saja digugurkan (mis. akun dinonaktifkan) tidak sempat
  // terbaca sah bila diperiksa pada milidetik yang sama.
  return new Date(u.kedaluwarsaPada).getTime() <= sekarang.getTime();
}

/** Sisa hari (dibulatkan ke atas); 0 bila sudah lewat. */
export function sisaHariUndangan(u: Undangan, sekarang: Date = new Date()): number {
  const sisaMs = new Date(u.kedaluwarsaPada).getTime() - sekarang.getTime();
  return sisaMs <= 0 ? 0 : Math.ceil(sisaMs / 86_400_000);
}

/** Kode undangan masih dapat dipakai? */
export function undanganSah(
  u: Undangan | null | undefined,
  sekarang: Date = new Date(),
): boolean {
  if (!u) return false;
  return !undanganTerpakai(u) && !undanganKedaluwarsa(u, sekarang);
}

/** Alasan kode tidak dapat dipakai — untuk pesan yang jelas di halaman aktivasi. */
export function pesanKodeTidakSah(
  u: Undangan | null | undefined,
  sekarang: Date = new Date(),
): string | null {
  if (!u) return "Kode aktivasi tidak dikenal. Periksa kembali atau minta kode baru ke sekretaris desa.";
  if (undanganTerpakai(u)) return "Kode aktivasi ini sudah pernah dipakai. Minta sekretaris desa menerbitkan kode baru.";
  if (undanganKedaluwarsa(u, sekarang)) return "Kode aktivasi sudah kedaluwarsa. Minta sekretaris desa menerbitkan kode baru.";
  return null;
}

/**
 * Samarkan email untuk ditampilkan di halaman aktivasi: hanya huruf pertama dan
 * terakhir bagian lokal yang tersisa. Halaman aktivasi dapat dibuka siapa saja
 * yang memegang kode, jadi alamat lengkap tidak perlu dibeberkan.
 */
export function samarkanEmail(email: string): string {
  const [lokal, domain] = email.split("@");
  if (!domain || !lokal) return email;
  if (lokal.length <= 2) return `${lokal.slice(0, 1)}***@${domain}`;
  return `${lokal.slice(0, 1)}***${lokal.slice(-1)}@${domain}`;
}