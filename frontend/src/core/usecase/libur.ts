/**
 * Aturan penetapan hari libur: memeriksa isian sebelum dikirim, sehingga
 * kesalahan bidang tertangkap di layar — bukan sebagai penolakan server.
 * Paralel dengan `rapikanLibur` pada usecase Go (`POST /admin/libur`).
 *
 * Pemeriksaan ini penting karena tanggal yang salah berpengaruh langsung ke
 * penilaian kedisiplinan: hari libur yang keliru menghapus kewajiban presensi
 * sehari, sedangkan hari kerja yang keliru dibaca sebagai libur membuat
 * perangkat tercatat tanpa keterangan padahal kantor buka.
 */

import { JENIS_LIBUR, tanggalSah, tahunDariIso } from "@/core/domain/libur";
import type { SimpanLiburCommand } from "@/core/ports/gateways";

export interface HasilValidasiLibur {
  readonly sah: boolean;
  readonly galat: string[];
}

/**
 * Periksa isian satu hari libur. Seluruh galat dikumpulkan sekaligus supaya
 * pengelola akun tidak memperbaiki satu bidang lalu menekan simpan berkali-kali.
 *
 * `tahunLain` (opsional) menolak tanggal di luar tahun yang sedang dibuka —
 * tahun itu dipilih dari daftar, bukan diketik, jadi tanggal yang meleset ke
 * tahun lain hampir pasti salah ketik.
 */
export function validasiLibur(
  input: SimpanLiburCommand,
  tahunLain?: number,
): HasilValidasiLibur {
  const galat: string[] = [];
  const tanggal = input.tanggal.trim();
  const nama = input.nama.trim();

  if (!tanggalSah(tanggal)) {
    galat.push("Tanggal harus berformat YYYY-MM-DD dan benar-benar ada.");
  } else if (tahunLain !== undefined && tahunDariIso(tanggal) !== tahunLain) {
    galat.push(`Tanggal harus berada pada tahun ${tahunLain}.`);
  }
  if (!nama) {
    galat.push("Nama hari libur wajib diisi.");
  } else if ([...nama].length > 160) {
    galat.push("Nama hari libur terlalu panjang (maks. 160 huruf).");
  }
  if (input.jenis !== undefined && !JENIS_LIBUR.includes(input.jenis)) {
    galat.push("Jenis hari libur tidak dikenal.");
  }

  return { sah: galat.length === 0, galat };
}

/**
 * Rapikan isian sebelum disimpan: tanggal & nama tanpa spasi berlebih. Jenis
 * yang kosong dibiarkan kosong — backend yang memutuskan bawaannya (libur
 * lokal), supaya tidak ada dua tempat yang menetapkan kebijakan berbeda.
 */
export function rapikanLibur(input: SimpanLiburCommand): SimpanLiburCommand {
  return {
    tanggal: input.tanggal.trim(),
    nama: input.nama.trim(),
    jenis: input.jenis,
  };
}
