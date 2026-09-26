import { describe, expect, it } from "vitest";
import {
  evaluateCheckIn,
  evaluateCheckOut,
  formatSelisihMenit,
  kalimatSelisihBarisAdmin,
  kalimatSelisihTransaksi,
  ringkasanSelisih,
  ringkasanSelisihBarisAdmin,
  type TransaksiWaktu,
} from "@/core/usecase/attendance-status";
import type {
  AttendanceListItem,
  AttendanceStatus,
  AttendanceType,
  WorkSchedule,
} from "@/core/domain/attendance";

const jadwal: WorkSchedule = {
  id: "sch-1",
  name: "Kantor",
  checkInStart: "07:30",
  checkInDeadline: "08:00",
  checkOutStart: "16:00",
  checkOutEnd: "17:00",
  workDays: [1, 2, 3, 4, 5, 6],
};

const pada = (jam: number, menit: number) => new Date(2026, 8, 10, jam, menit);

/**
 * Waktu server dalam WITA, ditulis seperti balasan API (ISO UTC) — supaya uji
 * selisih tidak bergantung pada zona waktu mesin yang menjalankannya:
 * 08:25 WITA adalah 00:25Z, dan hanya benar bila dikonversi kembali ke WITA.
 */
const wita = (hhmm: string) => new Date(`2026-09-10T${hhmm}:00+08:00`);

const transaksi = (
  type: AttendanceType,
  status: AttendanceStatus,
  hhmm: string,
): TransaksiWaktu => ({
  type,
  status,
  verification: { serverTime: wita(hhmm).toISOString() },
});

/** Baris monitoring admin: sama, tetapi waktunya ada di `at`. */
const barisAdmin = (
  type: AttendanceType,
  status: AttendanceStatus,
  hhmm: string,
): AttendanceListItem => ({
  id: `att-${hhmm}`,
  userId: "usr-1",
  userName: "Ahmad",
  position: "Kepala Urusan",
  type,
  mode: "WFO",
  status,
  at: wita(hhmm).toISOString(),
  // 0 = belum ada selisih tersimpan (baris lama) → dihitung ulang dari jadwal.
  selisihMenit: 0,
  distanceMeters: 12,
});

describe("evaluateCheckIn", () => {
  it("tepat waktu sebelum ambang batas", () => {
    expect(evaluateCheckIn(jadwal, pada(7, 59))).toEqual({
      status: "TEPAT_WAKTU",
      deltaMinutes: -1,
    });
  });

  it("tepat waktu tepat di ambang batas", () => {
    expect(evaluateCheckIn(jadwal, pada(8, 0)).status).toBe("TEPAT_WAKTU");
  });

  it("terlambat satu menit setelah ambang batas", () => {
    expect(evaluateCheckIn(jadwal, pada(8, 1))).toEqual({
      status: "TERLAMBAT",
      deltaMinutes: 1,
    });
  });

  it("terlambat jauh terhitung dari ambang batas", () => {
    const hasil = evaluateCheckIn(jadwal, pada(9, 40));
    expect(hasil.status).toBe("TERLAMBAT");
    expect(hasil.deltaMinutes).toBe(100);
  });
});

describe("evaluateCheckOut", () => {
  it("pulang cepat sebelum jam pulang", () => {
    expect(evaluateCheckOut(jadwal, pada(15, 59))).toEqual({
      status: "PULANG_CEPAT",
      deltaMinutes: -1,
    });
  });

  it("tepat waktu dalam rentang pulang", () => {
    expect(evaluateCheckOut(jadwal, pada(16, 30)).status).toBe("TEPAT_WAKTU");
  });

  it("lebih dari jam kerja setelah rentang pulang", () => {
    expect(evaluateCheckOut(jadwal, pada(17, 1))).toEqual({
      status: "LEBIH_KERJA",
      deltaMinutes: 1,
    });
  });
});

describe("formatSelisihMenit", () => {
  it("menit saja bila kurang dari satu jam", () => {
    expect(formatSelisihMenit(25)).toBe("25 mnt");
  });

  it("jam saja bila pas", () => {
    expect(formatSelisihMenit(60)).toBe("1 jam");
    expect(formatSelisihMenit(120)).toBe("2 jam");
  });

  it("jam dan menit", () => {
    expect(formatSelisihMenit(70)).toBe("1 jam 10 mnt");
    expect(formatSelisihMenit(145)).toBe("2 jam 25 mnt");
  });

  it("selisih negatif dibaca sebagai durasi", () => {
    expect(formatSelisihMenit(-95)).toBe("1 jam 35 mnt");
  });

  it("nol berarti tepat pada jadwal", () => {
    expect(formatSelisihMenit(0)).toBe("tepat pada jadwal");
  });
});

describe("kalimatSelisihTransaksi", () => {
  it("terlambat menyebut selisih menit dan batas masuknya", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_IN", "TERLAMBAT", "08:25"), jadwal),
    ).toBe("terlambat 25 mnt dari batas masuk 08:00");
  });

  it("terlambat lebih dari satu jam", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_IN", "TERLAMBAT", "09:40"), jadwal),
    ).toBe("terlambat 1 jam 40 mnt dari batas masuk 08:00");
  });

  it("tepat waktu tidak berkata apa-apa", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_IN", "TEPAT_WAKTU", "07:59"), jadwal),
    ).toBeNull();
  });

  it("pulang cepat menyebut selisih dari jam pulang", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_OUT", "PULANG_CEPAT", "15:30"), jadwal),
    ).toBe("pulang cepat 30 mnt dari jam pulang 16:00");
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_OUT", "PULANG_CEPAT", "14:50"), jadwal),
    ).toBe("pulang cepat 1 jam 10 mnt dari jam pulang 16:00");
  });

  it("pulang di dalam rentang jam kerja tidak berkata apa-apa", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_OUT", "TEPAT_WAKTU", "16:30"), jadwal),
    ).toBeNull();
  });

  it("lebih kerja dihitung dari batas pulang", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_OUT", "LEBIH_KERJA", "18:05"), jadwal),
    ).toBe("lebih kerja 1 jam 5 mnt dari batas pulang 17:00");
  });

  it("status dari server yang menentukan, bukan jam mentah", () => {
    // Jamnya lewat batas masuk, tetapi server menyimpannya TEPAT_WAKTU: tidak
    // ada keterangan yang boleh diciptakan tampilan.
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_IN", "TEPAT_WAKTU", "08:45"), jadwal),
    ).toBeNull();
  });

  it("tanpa jadwal tidak ada ambang yang bisa dibandingkan", () => {
    expect(
      kalimatSelisihTransaksi(transaksi("CHECK_IN", "TERLAMBAT", "08:25"), null),
    ).toBeNull();
  });
});

describe("ringkasanSelisih", () => {
  it("menjumlahkan durasi, bukan hanya jumlah kejadian", () => {
    const total = ringkasanSelisih(
      [
        transaksi("CHECK_IN", "TERLAMBAT", "08:25"), // 25 mnt
        transaksi("CHECK_IN", "TERLAMBAT", "09:00"), // 60 mnt
        transaksi("CHECK_OUT", "PULANG_CEPAT", "15:30"), // 30 mnt
      ],
      jadwal,
    );
    expect(total.terlambatMenit).toBe(85);
    expect(total.pulangCepatMenit).toBe(30);
  });

  it("transaksi tepat waktu tidak menambah apa pun", () => {
    const total = ringkasanSelisih(
      [
        transaksi("CHECK_IN", "TEPAT_WAKTU", "07:45"),
        transaksi("CHECK_OUT", "TEPAT_WAKTU", "16:30"),
        transaksi("CHECK_OUT", "LEBIH_KERJA", "18:00"), // 1 jam lebih kerja
      ],
      jadwal,
    );
    expect(total.terlambatMenit).toBe(0);
    expect(total.pulangCepatMenit).toBe(0);
    expect(total.lebihKerjaMenit).toBe(60);
  });

  it("selisih tersimpan dipakai walau jadwal sudah berubah", () => {
    // Dicatat saat batas masuk 08:00 (25 mnt); jadwal kini 13:00 — durasi
    // tetap 25 mnt, bukan dihitung ulang menjadi 0.
    const total = ringkasanSelisih(
      [{ ...transaksi("CHECK_IN", "TERLAMBAT", "08:25"), selisihMenit: 25 }],
      { ...jadwal, checkInDeadline: "13:00" },
    );
    expect(total.terlambatMenit).toBe(25);
  });

  it("tanpa jadwal totalnya nol, bukan salah hitung", () => {
    const total = ringkasanSelisih([transaksi("CHECK_IN", "TERLAMBAT", "08:25")], null);
    expect(total).toEqual({
      terlambatMenit: 0,
      pulangCepatMenit: 0,
      lebihKerjaMenit: 0,
    });
  });
});

describe("ringkasanSelisihBarisAdmin", () => {
  it("baris monitoring memakai waktu `at`, bukan verification", () => {
    const total = ringkasanSelisihBarisAdmin(
      [
        barisAdmin("CHECK_IN", "TERLAMBAT", "08:25"), // 25 mnt
        barisAdmin("CHECK_OUT", "PULANG_CEPAT", "14:50"), // 70 mnt
      ],
      jadwal,
    );
    expect(total.terlambatMenit).toBe(25);
    expect(total.pulangCepatMenit).toBe(70);
  });

  it("kalimat barisnya menyebut ambang jadwal yang sama", () => {
    expect(kalimatSelisihBarisAdmin(barisAdmin("CHECK_IN", "TERLAMBAT", "08:25"), jadwal)).toBe(
      "terlambat 25 mnt dari batas masuk 08:00",
    );
    expect(
      kalimatSelisihBarisAdmin(barisAdmin("CHECK_OUT", "PULANG_CEPAT", "15:30"), jadwal),
    ).toBe("pulang cepat 30 mnt dari jam pulang 16:00");
    expect(
      kalimatSelisihBarisAdmin(barisAdmin("CHECK_IN", "TEPAT_WAKTU", "07:50"), jadwal),
    ).toBeNull();
  });

  it("selisih tersimpan dipakai walau jadwal sudah berubah", () => {
    // Baris dicatat saat batas masuk 08:00 → 25 mnt terlambat. Jadwal kini
    // 13:00: total & kalimat tetap 25 mnt, bukan dihitung ulang jadi nol.
    const baris = { ...barisAdmin("CHECK_IN", "TERLAMBAT", "08:25"), selisihMenit: 25 };
    const jadwalBaru = { ...jadwal, checkInDeadline: "13:00" };
    expect(ringkasanSelisihBarisAdmin([baris], jadwalBaru).terlambatMenit).toBe(25);
    expect(kalimatSelisihBarisAdmin(baris, jadwalBaru)).toBe(
      "terlambat 25 mnt dari batas masuk 13:00",
    );
  });
});
