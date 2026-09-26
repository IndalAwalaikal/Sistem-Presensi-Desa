/**
 * Aturan murni profil pemilik akun: kontak yang boleh diubah sendiri dan
 * penggantian kata sandi. Cerminan aturan backend (internal/usecase/profil.go)
 * supaya pesan galatnya sama di kedua sisi.
 *
 * Yang sengaja tidak diwakili di sini: nama lengkap, email dinas, NIP/NIK,
 * jabatan, dan unit kerja. Kelimanya bersumber dari berkas kepegawaian desa dan
 * ditetapkan pengelola akun saat akun dibuat — tidak ada jalur ubahnya.
 */

import {
  PANJANG_ALAMAT_MIN,
  validasiKataSandi,
  type HasilValidasi,
} from "@/core/usecase/akun";

/** Banyaknya angka pada nomor telepon — pengguna boleh menulis 0852-xxxx-xxxx. */
export function digitTelepon(telepon: string): number {
  return telepon.replace(/[^0-9]/g, "").length;
}

export interface DataKontak {
  readonly phoneNumber: string;
  readonly address: string;
}

/**
 * Kontak wajib benar-benar dapat dipakai menghubungi yang bersangkutan, jadi
 * nomor dinilai dari jumlah angkanya (bukan bentuk tulisannya) dan alamat harus
 * cukup panjang untuk ditemukan.
 */
export function validasiKontak({ phoneNumber, address }: DataKontak): HasilValidasi {
  const galat: string[] = [];
  const digit = digitTelepon(phoneNumber);
  if (digit < 9 || digit > 15) {
    galat.push("Nomor telepon tidak sah (9–15 angka).");
  }
  if (address.trim().length < PANJANG_ALAMAT_MIN) {
    galat.push(`Alamat minimal ${PANJANG_ALAMAT_MIN} karakter.`);
  }
  return { sah: galat.length === 0, galat };
}

export interface DataUbahSandi {
  readonly sandiLama: string;
  readonly sandiBaru: string;
  readonly konfirmasi: string;
}

/**
 * Ganti kata sandi: sandi lama disebut sebagai bukti bahwa yang mengganti memang
 * pemiliknya, dan sandi baru harus berbeda supaya penggantian tidak sia-sia.
 */
export function validasiUbahSandi({
  sandiLama,
  sandiBaru,
  konfirmasi,
}: DataUbahSandi): HasilValidasi {
  const galat: string[] = [];
  if (!sandiLama) {
    galat.push("Kata sandi lama wajib diisi.");
  }
  galat.push(...validasiKataSandi({ password: sandiBaru, konfirmasi }).galat);
  if (sandiLama && sandiLama === sandiBaru) {
    galat.push("Kata sandi baru harus berbeda dari kata sandi lama.");
  }
  return { sah: galat.length === 0, galat };
}
