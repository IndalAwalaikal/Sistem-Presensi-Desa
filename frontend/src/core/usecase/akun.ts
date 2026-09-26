/**
 * Aturan murni seputar akun perangkat desa: validasi akun baru yang dibuat
 * sekretaris/kepala desa, serta validasi aktivasi (kata sandi sendiri + data
 * mandiri + persetujuan biometrik). Tanpa dependensi framework, sehingga dapat
 * dipakai lapisan data contoh sekarang dan ditegakkan kembali di backend
 * nantinya.
 */

export const PANJANG_SANDI_MIN = 8;
export const PANJANG_SANDI_MAKS = 72;

/** Panjang minimal alamat yang dianggap terisi sungguhan. */
export const PANJANG_ALAMAT_MIN = 8;

export interface HasilValidasi {
  readonly sah: boolean;
  readonly galat: readonly string[];
}

function hasil(galat: string[]): HasilValidasi {
  return { sah: galat.length === 0, galat };
}

/**
 * Pola email sengaja longgar — kewenangan memastikan email dinas ada di tangan
 * pengelola akun, bukan di regex. Yang penting bentuknya masuk akal.
 */
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DataKataSandi {
  readonly password: string;
  readonly konfirmasi: string;
}

export function validasiKataSandi({ password, konfirmasi }: DataKataSandi): HasilValidasi {
  const galat: string[] = [];
  if (password.length < PANJANG_SANDI_MIN) {
    galat.push(`Kata sandi minimal ${PANJANG_SANDI_MIN} karakter.`);
  }
  if (password.length > PANJANG_SANDI_MAKS) {
    galat.push(`Kata sandi maksimal ${PANJANG_SANDI_MAKS} karakter.`);
  }
  if (/^\s|\s$/.test(password)) {
    galat.push("Kata sandi tidak boleh diawali atau diakhiri spasi.");
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    galat.push("Kata sandi harus memuat huruf dan angka.");
  }
  if (password !== konfirmasi) {
    galat.push("Ulangi kata sandi tidak sama.");
  }
  return hasil(galat);
}

export interface DataAkunBaru {
  readonly fullName: string;
  readonly email: string;
  /** NIP atau NIK administrasi desa — diketik pengelola akun dari sumber resmi. */
  readonly employeeId: string;
  readonly position: string;
  readonly unit: string;
}

/**
 * Data kepegawaian adalah dasar laporan kedisiplinan dan tunjangan, jadi tidak
 * boleh setengah terisi. Identitas wajib diisi pengelola akun; pengguna hanya
 * melengkapi data yang boleh diisi sendiri (telepon, alamat).
 */
export function validasiAkunBaru({
  fullName,
  email,
  employeeId,
  position,
  unit,
}: DataAkunBaru): HasilValidasi {
  const galat: string[] = [];
  if (fullName.trim().length < 3) galat.push("Nama lengkap minimal 3 karakter.");
  if (!POLA_EMAIL.test(email.trim())) galat.push("Format email dinas tidak sah.");
  if (employeeId.trim().length < 6) {
    galat.push("NIP/NIK administrasi minimal 6 karakter.");
  }
  if (position.trim().length < 3) galat.push("Jabatan wajib diisi.");
  if (unit.trim().length < 3) galat.push("Unit kerja wajib diisi.");
  return hasil(galat);
}

export interface DataAktivasi {
  readonly password: string;
  readonly konfirmasi: string;
  readonly phoneNumber: string;
  readonly address: string;
  readonly consentBiometrik: boolean;
}

/**
 * Aktivasi akun: kata sandi milik pengguna sendiri, kontak yang dapat
 * dihubungi, dan persetujuan pemrosesan data wajah (dokumen §19). Tanpa
 * persetujuan, pendaftaran biometrik tidak boleh dimulai.
 */
export function validasiAktivasiAkun({
  password,
  konfirmasi,
  phoneNumber,
  address,
  consentBiometrik,
}: DataAktivasi): HasilValidasi {
  const galat: string[] = [...validasiKataSandi({ password, konfirmasi }).galat];
  const digit = phoneNumber.replace(/[^0-9]/g, "");
  if (digit.length < 9 || digit.length > 15) {
    galat.push("Nomor telepon tidak sah (9–15 angka).");
  }
  if (address.trim().length < PANJANG_ALAMAT_MIN) {
    galat.push(`Alamat minimal ${PANJANG_ALAMAT_MIN} karakter.`);
  }
  if (!consentBiometrik) {
    galat.push(
      "Persetujuan pemrosesan data wajah wajib diberikan sebelum pendaftaran biometrik.",
    );
  }
  return hasil(galat);
}