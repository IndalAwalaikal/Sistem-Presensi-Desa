import { describe, expect, it } from "vitest";
import { PANJANG_ALAMAT_MIN } from "@/core/usecase/akun";
import { digitTelepon, validasiKontak, validasiUbahSandi } from "@/core/usecase/profil";

const KONTAK = {
  phoneNumber: "0852-4000-1001",
  address: "Desa Anabanua, Kec. Barru, Kab. Barru",
};

describe("digitTelepon", () => {
  it("menghitung angka saja, mengabaikan tanda hubung dan spasi", () => {
    expect(digitTelepon("0852-4000-1001")).toBe(12);
    expect(digitTelepon("+62 852 4000 1001")).toBe(13);
    expect(digitTelepon("")).toBe(0);
  });
});

describe("validasiKontak", () => {
  it("menerima kontak yang dapat dipakai menghubungi", () => {
    expect(validasiKontak(KONTAK).sah).toBe(true);
  });

  it("menolak nomor telepon yang terlalu pendek", () => {
    const hasil = validasiKontak({ ...KONTAK, phoneNumber: "0812" });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat.join(" ")).toContain("9–15 angka");
  });

  it("menolak nomor telepon yang terlalu panjang", () => {
    expect(validasiKontak({ ...KONTAK, phoneNumber: "0812345678901234" }).sah).toBe(false);
  });

  it("menolak alamat yang terlalu pendek untuk ditemukan", () => {
    const hasil = validasiKontak({ ...KONTAK, address: "Barru" });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat.join(" ")).toContain(String(PANJANG_ALAMAT_MIN));
  });

  it("menolak alamat yang hanya berisi spasi", () => {
    expect(validasiKontak({ ...KONTAK, address: "        " }).sah).toBe(false);
  });

  it("tidak menilai identitas kepegawaian — itu bukan urusan pemilik akun", () => {
    // Hanya dua field kontak yang dikenal; tidak ada parameter nama/NIP/jabatan
    // yang dapat divalidasi maupun diubah dari sini.
    expect(Object.keys(validasiKontak(KONTAK))).toEqual(["sah", "galat"]);
    expect(validasiKontak({ ...KONTAK, address: "" }).galat).toHaveLength(1);
  });
});

describe("validasiUbahSandi", () => {
  const dasar = {
    sandiLama: "anabanua2026",
    sandiBaru: "anabanua2027",
    konfirmasi: "anabanua2027",
  };

  it("menerima penggantian yang lengkap", () => {
    expect(validasiUbahSandi(dasar).sah).toBe(true);
  });

  it("mewajibkan kata sandi lama sebagai bukti", () => {
    const hasil = validasiUbahSandi({ ...dasar, sandiLama: "" });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat).toContain("Kata sandi lama wajib diisi.");
  });

  it("menolak kata sandi baru yang tidak memenuhi aturan", () => {
    expect(
      validasiUbahSandi({ sandiLama: "anabanua2026", sandiBaru: "ab1", konfirmasi: "ab1" }).sah,
    ).toBe(false);
  });

  it("menolak ulangan kata sandi baru yang tidak sama", () => {
    expect(
      validasiUbahSandi({ ...dasar, konfirmasi: "anabanua2028" }).galat,
    ).toContain("Ulangi kata sandi tidak sama.");
  });

  it("menolak kata sandi baru yang sama dengan yang lama", () => {
    const hasil = validasiUbahSandi({
      sandiLama: "anabanua2026",
      sandiBaru: "anabanua2026",
      konfirmasi: "anabanua2026",
    });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat.join(" ")).toContain("berbeda dari kata sandi lama");
  });
});
