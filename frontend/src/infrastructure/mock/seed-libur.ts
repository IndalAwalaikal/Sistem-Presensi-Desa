import type { HariLibur } from "@/core/domain/libur";

/**
 * Kalender resmi bawaan untuk mode contoh — salinan daftar yang sama dengan
 * `backend/internal/seed/hari_libur.go`.
 *
 * Sumber: SKB Menteri Agama, Menteri Ketenagakerjaan, dan Menteri PANRB
 * No. 1497 Tahun 2025, No. 2 Tahun 2025, dan No. 5 Tahun 2025 tentang Hari
 * Libur Nasional dan Cuti Bersama Tahun 2026 — 17 hari libur nasional dan
 * 8 hari cuti bersama.
 *
 * Tahun berikutnya ditambahkan di sini begitu SKB-nya terbit, atau ditarik
 * langsung dari sumber resmi lewat layar **Hari Libur** pada mode backend.
 */
export const SEED_HARI_LIBUR: HariLibur[] = [
  // 2026 — libur nasional
  { tanggal: "2026-01-01", nama: "Tahun Baru 2026 Masehi", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-01-16", nama: "Isra Mikraj Nabi Muhammad saw.", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-02-17", nama: "Tahun Baru Imlek 2577 Kongzili", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-03-19", nama: "Hari Suci Nyepi (Tahun Baru Saka 1948)", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-03-21", nama: "Hari Raya Idulfitri 1447 H", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-03-22", nama: "Hari Raya Idulfitri 1447 H", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-04-03", nama: "Wafat Yesus Kristus", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-04-05", nama: "Kebangkitan Yesus Kristus (Paskah)", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-05-01", nama: "Hari Buruh Internasional", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-05-14", nama: "Kenaikan Yesus Kristus", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-05-27", nama: "Hari Raya Iduladha 1447 H", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-05-31", nama: "Hari Raya Waisak 2570 BE", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-06-01", nama: "Hari Lahir Pancasila", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-06-16", nama: "1 Muharam Tahun Baru Islam 1448 H", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-08-17", nama: "Proklamasi Kemerdekaan", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-08-25", nama: "Maulid Nabi Muhammad saw.", jenis: "LIBUR_NASIONAL", sumber: "SKB" },
  { tanggal: "2026-12-25", nama: "Kelahiran Yesus Kristus", jenis: "LIBUR_NASIONAL", sumber: "SKB" },

  // 2026 — cuti bersama
  { tanggal: "2026-02-16", nama: "Cuti Bersama Tahun Baru Imlek 2577 Kongzili", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-03-18", nama: "Cuti Bersama Hari Suci Nyepi (Tahun Baru Saka 1948)", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-03-20", nama: "Cuti Bersama Hari Raya Idulfitri 1447 H", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-03-23", nama: "Cuti Bersama Hari Raya Idulfitri 1447 H", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-03-24", nama: "Cuti Bersama Hari Raya Idulfitri 1447 H", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-05-15", nama: "Cuti Bersama Kenaikan Yesus Kristus", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-05-28", nama: "Cuti Bersama Hari Raya Iduladha 1447 H", jenis: "CUTI_BERSAMA", sumber: "SKB" },
  { tanggal: "2026-12-24", nama: "Cuti Bersama Kelahiran Yesus Kristus", jenis: "CUTI_BERSAMA", sumber: "SKB" },
];

/** Tahun yang punya daftar bawaan pada mode contoh. */
export function tahunLiburTersedia(): number[] {
  const set = new Set<number>();
  for (const h of SEED_HARI_LIBUR) set.add(Number(h.tanggal.slice(0, 4)));
  return [...set].sort();
}
