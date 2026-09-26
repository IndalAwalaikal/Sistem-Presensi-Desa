import { describe, expect, it } from "vitest";
import {
  hitungJenis,
  isHariLibur,
  kalenderLibur,
  petaNamaLibur,
  tanggalSah,
  tahunDariIso,
  type HariLibur,
} from "@/core/domain/libur";
import { rapikanLibur, validasiLibur } from "@/core/usecase/libur";

const LIBUR: HariLibur[] = [
  {
    tanggal: "2026-08-17",
    nama: "Proklamasi Kemerdekaan",
    jenis: "LIBUR_NASIONAL",
    sumber: "SKB",
  },
  {
    tanggal: "2026-12-24",
    nama: "Cuti Bersama Kelahiran Yesus Kristus",
    jenis: "CUTI_BERSAMA",
    sumber: "SKB",
  },
  {
    tanggal: "2026-03-05",
    nama: "Hari Jadi Desa Anabanua",
    jenis: "LIBUR_LOKAL",
    sumber: "MANUAL",
  },
];

describe("bentuk hari libur", () => {
  it("tanggal yang tidak ada di kalender ditolak", () => {
    expect(tanggalSah("2026-02-28")).toBe(true);
    expect(tanggalSah("2024-02-29")).toBe(true); // kabisat
    expect(tanggalSah("2026-02-29")).toBe(false); // bukan kabisat
    expect(tanggalSah("2026-13-01")).toBe(false);
    expect(tanggalSah("2026-2-3")).toBe(false); // tanpa nol di depan
    expect(tanggalSah("2026-04-31")).toBe(false);
    expect(tanggalSah("bukan-tanggal")).toBe(false);
    expect(tanggalSah("")).toBe(false);
  });

  it("tahun diambil dari tanggal, atau null bila rusak", () => {
    expect(tahunDariIso("2026-12-25")).toBe(2026);
    expect(tahunDariIso("2026-02-30")).toBeNull();
  });

  it("kalender menolak tanggal rusak, bukan menjadikannya hari libur", () => {
    const k = kalenderLibur([
      ...LIBUR,
      { tanggal: "2026-02-30", nama: "Salah ketik", jenis: "LIBUR_LOKAL", sumber: "MANUAL" },
    ]);
    expect(k.size).toBe(3);
    expect(k.has("2026-02-30")).toBe(false);
    expect(isHariLibur(k, "2026-08-17")).toBe(true);
    expect(isHariLibur(k, "2026-08-18")).toBe(false);
    // Kalender belum dimuat bukan alasan menuduh siapa pun alpa.
    expect(isHariLibur(undefined, "2026-08-17")).toBe(false);
  });

  it("peta nama libur dipakai kalender riwayat untuk keterangan tanggal", () => {
    const peta = petaNamaLibur(LIBUR);
    expect(peta.get("2026-08-17")?.nama).toBe("Proklamasi Kemerdekaan");
    expect(peta.get("2026-03-05")?.jenis).toBe("LIBUR_LOKAL");
    expect(peta.has("2026-08-18")).toBe(false);
  });

  it("cacah per jenis memisahkan nasional, cuti bersama, dan libur lokal", () => {
    expect(hitungJenis(LIBUR)).toEqual({
      LIBUR_NASIONAL: 1,
      CUTI_BERSAMA: 1,
      LIBUR_LOKAL: 1,
    });
  });
});

describe("validasi isian hari libur", () => {
  it("isian yang benar diterima", () => {
    expect(validasiLibur({ tanggal: "2026-03-05", nama: "Hari Jadi Desa" }).sah).toBe(true);
    expect(validasiLibur({ tanggal: "2026-03-05", nama: "Hari Jadi Desa" }, 2026).sah).toBe(true);
  });

  it("nama kosong, tanggal rusak, dan jenis asing ditolak", () => {
    const hasil = validasiLibur({
      tanggal: "2026-02-30",
      nama: "   ",
      // @ts-expect-error — jenis di luar daftar, seperti balasan server yang salah.
      jenis: "HARI_BESAR",
    });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat).toHaveLength(3);
    expect(hasil.galat.join(" ")).toMatch(/format YYYY-MM-DD/);
    expect(hasil.galat.join(" ")).toMatch(/wajib diisi/);
    expect(hasil.galat.join(" ")).toMatch(/jenis/i);
  });

  it("tanggal di luar tahun yang dibuka ditolak", () => {
    const hasil = validasiLibur({ tanggal: "2027-01-01", nama: "Tahun Baru" }, 2026);
    expect(hasil.sah).toBe(false);
    expect(hasil.galat[0]).toMatch(/tahun 2026/);
  });

  it("rapikan membuang spasi berlebih tanpa mengubah jenis yang kosong", () => {
    expect(
      rapikanLibur({ tanggal: " 2026-03-05 ", nama: "  Hari Jadi Desa  " }),
    ).toEqual({ tanggal: "2026-03-05", nama: "Hari Jadi Desa", jenis: undefined });
  });
});
