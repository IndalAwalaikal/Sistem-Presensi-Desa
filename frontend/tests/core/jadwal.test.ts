import { describe, expect, it } from "vitest";
import {
  HARI_LABEL,
  URUTAN_HARI,
  isWorkDay,
  type WorkSchedule,
} from "@/core/domain/attendance";
import { rapikanJadwal, validasiJadwal } from "@/core/usecase/jadwal";
import { evaluateCheckIn, evaluateCheckOut } from "@/core/usecase/attendance-status";

const dasar = {
  checkInStart: "07:30",
  checkInDeadline: "08:00",
  checkOutStart: "16:00",
  checkOutEnd: "17:00",
  workDays: [1, 2, 3, 4, 5, 6],
};

describe("validasiJadwal", () => {
  it("menerima jadwal yang wajar", () => {
    expect(validasiJadwal(dasar)).toEqual({ sah: true, galat: [] });
  });

  it("menolak format jam yang bukan HH:MM 24 jam", () => {
    const hasil = validasiJadwal({ ...dasar, checkInDeadline: "8:00" });
    expect(hasil.sah).toBe(false);
    expect(hasil.galat.join(" ")).toMatch(/Batas masuk/);
  });

  it("menolak jam di luar 24 jam", () => {
    expect(validasiJadwal({ ...dasar, checkOutEnd: "25:10" }).sah).toBe(false);
  });

  it("menolak tanpa hari kerja", () => {
    expect(validasiJadwal({ ...dasar, workDays: [] }).galat.join(" ")).toMatch(
      /minimal satu hari kerja/i,
    );
  });

  it("menolak hari kerja yang tidak dikenal", () => {
    expect(validasiJadwal({ ...dasar, workDays: [1, 9] }).galat.join(" ")).toMatch(
      /Hari kerja tidak dikenal/,
    );
  });

  it("menolak jam masuk setelah batas masuk", () => {
    const hasil = validasiJadwal({ ...dasar, checkInStart: "08:30" });
    expect(hasil.galat.join(" ")).toMatch(/Jam masuk tidak boleh melewati batas masuk/);
  });

  it("menolak batas masuk setelah jam pulang", () => {
    const hasil = validasiJadwal({ ...dasar, checkInDeadline: "16:30" });
    expect(hasil.galat.join(" ")).toMatch(/Batas masuk harus sebelum jam pulang/);
  });

  it("menolak batas pulang yang tidak setelah jam pulang", () => {
    const hasil = validasiJadwal({ ...dasar, checkOutEnd: "16:00" });
    expect(hasil.galat.join(" ")).toMatch(/Batas pulang harus setelah jam pulang/);
  });

  it("mengumpulkan seluruh galat, bukan hanya yang pertama", () => {
    // Dua jam berformat salah sekaligus: keduanya harus dilaporkan, supaya
    // pengelola tidak memperbaiki jam satu per satu lalu menekan simpan berkali.
    const hasil = validasiJadwal({
      ...dasar,
      checkInStart: "9:00",
      checkOutEnd: "17.00",
    });
    expect(hasil.galat.length).toBeGreaterThan(1);
  });

  it("mengumpulkan galat urutan setelah seluruh format jam sah", () => {
    // Perbandingan jam baru bermakna bila formatnya sudah benar, jadi galat
    // urutan diperiksa pada tahap kedua — dan tetap dikumpulkan sekaligus.
    const hasil = validasiJadwal({
      ...dasar,
      checkInStart: "08:30",
      checkOutEnd: "16:00",
    });
    expect(hasil.galat.join(" ")).toMatch(/Jam masuk tidak boleh melewati batas masuk/);
    expect(hasil.galat.join(" ")).toMatch(/Batas pulang harus setelah jam pulang/);
  });
});

describe("rapikanJadwal", () => {
  it("mengurutkan Senin–Sabtu dan membuang hari kembar", () => {
    const hasil = rapikanJadwal({ ...dasar, workDays: [6, 1, 1, 0, 3] });
    expect(hasil.workDays).toEqual([1, 3, 6, 0]);
  });

  it("mempertahankan urutan tampil hari kerja", () => {
    // Urutan hari pada layar harus sama dengan urutan setelah dirapikan, supaya
    // yang dilihat pengelola akun sama dengan yang tersimpan.
    expect([...URUTAN_HARI]).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(URUTAN_HARI.every((h) => HARI_LABEL[h] !== undefined)).toBe(true);
  });
});

describe("jadwal yang telah diubah langsung dipakai penilaian", () => {
  // Inilah alasan jam kerja dipindahkan dari kode ke pengaturan: begitu
  // sekretaris/kepala desa mengubahnya, penilaian presensi ikut berubah.
  const jadwalBaru: WorkSchedule = {
    id: "sch-1",
    name: "Jadwal Kantor (WITA)",
    ...rapikanJadwal({ ...dasar, checkInDeadline: "07:45", checkOutStart: "15:30" }),
  };

  it("presensi datang pukul 07:50 menjadi terlambat", () => {
    expect(evaluateCheckIn(jadwalBaru, new Date(2026, 8, 10, 7, 50)).status).toBe(
      "TERLAMBAT",
    );
  });

  it("presensi pulang pukul 15:45 kini tepat waktu", () => {
    expect(evaluateCheckOut(jadwalBaru, new Date(2026, 8, 10, 15, 45)).status).toBe(
      "TEPAT_WAKTU",
    );
  });

  it("hari kerja baru menentukan hari yang dinilai", () => {
    const sabtu = new Date(2026, 8, 12); // Sabtu
    expect(isWorkDay(jadwalBaru, sabtu)).toBe(true);
    const minggu = new Date(2026, 8, 13); // Minggu
    expect(isWorkDay(jadwalBaru, minggu)).toBe(false);
    expect(isWorkDay({ ...jadwalBaru, workDays: [] }, sabtu)).toBe(false);
  });
});
