import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttendanceType } from "@/core/domain/attendance";
import { adminMock } from "@/infrastructure/mock/gateways/admin";
import { attendanceMock } from "@/infrastructure/mock/gateways/attendance";
import { authMock } from "@/infrastructure/mock/gateways/auth";
import { KATA_SANDI_DEMO, SEED_CONFIG } from "@/infrastructure/mock/seed-users";
import { resetSimpanan } from "@/infrastructure/mock/store";

/**
 * Jam kerja dan urutan presensi pada data contoh. Melengkapi uji aturan murni di
 * `tests/core/jadwal.test.ts`: yang diuji di sini adalah perilaku pintu data
 * yang menjadi acuan kontrak backend — jam kerja yang dapat ditetapkan
 * pengelola, jejak auditnya, dan penilaian datang/pulang terhadap jam berlaku.
 *
 * Waktu dibekukan pada Kamis 10 September 2026 pukul 07.40 WITA supaya status
 * presensi (tepat waktu/terlambat/pulang cepat) diuji tanpa bergantung pada jam
 * berapa uji ini dijalankan.
 */

/** Tetapkan waktu server ke Kamis, 10 September 2026 (hari kerja). */
function jam(h: number, m: number): void {
  vi.setSystemTime(new Date(2026, 8, 10, h, m, 0));
}

function lokasiKantor() {
  return {
    latitude: SEED_CONFIG.office.point.latitude,
    longitude: SEED_CONFIG.office.point.longitude,
  };
}

async function masuk(email: string): Promise<void> {
  await authMock.login({ email, password: KATA_SANDI_DEMO });
}

/** Presensi lengkap dengan verifikasi yang lolos (wajah, liveness, di kantor). */
function presensi(type: AttendanceType) {
  return attendanceMock.submitPresensi({
    type,
    mode: "WFO",
    faceScore: 0.9,
    livenessScore: 0.9,
    location: lokasiKantor(),
    accuracyMeters: 8,
  });
}

/** Jam kerja usulan: pulang lebih awal, hari kerja tidak urut dan kembar. */
const JADWAL_USULAN = {
  checkInStart: "07:15",
  checkInDeadline: "07:45",
  checkOutStart: "15:30",
  checkOutEnd: "17:00",
  workDays: [6, 1, 1, 3, 4],
};

beforeEach(() => {
  vi.useFakeTimers();
  jam(7, 40);
  resetSimpanan();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("penetapan jam kerja oleh pengelola", () => {
  it("sekretaris desa dapat mengubah jam kerja dan perubahan itu berlaku", async () => {
    await masuk("sekretaris@anabanua.id");
    const jadwal = await adminMock.updateSchedule(JADWAL_USULAN);

    expect(jadwal.checkInDeadline).toBe("07:45");
    expect(jadwal.checkOutStart).toBe("15:30");
    // Hari kerja dirapikan: kembar dibuang, urut Senin–Sabtu.
    expect(jadwal.workDays).toEqual([1, 3, 4, 6]);

    // Yang dibaca presensi berikutnya adalah jadwal baru, bukan seed di kode.
    const cfg = await attendanceMock.getActiveConfig();
    expect(cfg.schedule.checkInDeadline).toBe("07:45");
    expect(cfg.schedule.checkOutStart).toBe("15:30");
    expect(cfg.schedule.checkInStart).toBe("07:15");
  });

  it("kepala desa juga berwenang menetapkan jam kerja", async () => {
    await masuk("kepala@anabanua.id");
    const jadwal = await adminMock.updateSchedule(JADWAL_USULAN);
    expect(jadwal.checkOutStart).toBe("15:30");
  });

  it("perangkat desa tidak dapat menetapkan jam kerja", async () => {
    await masuk("dewi@anabanua.id");
    await expect(adminMock.updateSchedule(JADWAL_USULAN)).rejects.toThrow(
      /Hanya sekretaris atau kepala desa/i,
    );
    // Dan jam kerja yang berlaku tidak berubah.
    expect((await attendanceMock.getActiveConfig()).schedule.checkInDeadline).toBe(
      "08:00",
    );
  });

  it("menolak jam kerja yang mustahil", async () => {
    await masuk("sekretaris@anabanua.id");
    await expect(
      adminMock.updateSchedule({ ...JADWAL_USULAN, checkOutEnd: "15:00" }),
    ).rejects.toThrow(/Batas pulang harus setelah jam pulang/i);
    await expect(
      adminMock.updateSchedule({ ...JADWAL_USULAN, workDays: [] }),
    ).rejects.toThrow(/minimal satu hari kerja/i);
    await expect(
      adminMock.updateSchedule({ ...JADWAL_USULAN, checkInStart: "8:15" }),
    ).rejects.toThrow(/Jam masuk/i);
  });

  it("meninggalkan jejak audit berisi jam sebelum dan sesudahnya", async () => {
    await masuk("sekretaris@anabanua.id");
    await adminMock.updateSchedule(JADWAL_USULAN);

    const log = (await adminMock.listAuditLogs()).find(
      (l) => l.action === "MENGUBAH_JADWAL",
    );
    expect(log).toBeTruthy();
    expect(log?.actorName).toBe("Rahmat Hidayat");
    expect(log?.targetType).toBe("WorkSchedule");
    // Jam lama (dari seed) dan jam baru sama-sama tercatat, jadi perubahan
    // kebijakan jam kerja dapat ditelusuri tanpa menebak.
    expect(log?.detail).toContain("07:30–08:00");
    expect(log?.detail).toContain("07:15–07:45");
    expect(log?.detail).toContain("15:30–17:00");
  });
});

describe("penetapan geofence kantor oleh pengelola", () => {
  const KANTOR_USULAN = {
    name: "Balai Sementara",
    latitude: -4.32,
    longitude: 119.64,
    radiusMeters: 150,
  };

  it("sekretaris desa dapat memindahkan titik & radius dan berlaku langsung", async () => {
    await masuk("sekretaris@anabanua.id");
    const kantor = await adminMock.updateOffice(KANTOR_USULAN);

    expect(kantor.name).toBe("Balai Sementara");
    expect(kantor.radiusMeters).toBe(150);

    // Yang dibaca presensi berikutnya adalah kantor baru, bukan seed di kode.
    const cfg = await attendanceMock.getActiveConfig();
    expect(cfg.office.name).toBe("Balai Sementara");
    expect(cfg.office.radiusMeters).toBe(150);
  });

  it("kepala desa juga berwenang menetapkan lokasi kantor", async () => {
    await masuk("kepala@anabanua.id");
    const kantor = await adminMock.updateOffice(KANTOR_USULAN);
    expect(kantor.point.latitude).toBe(-4.32);
  });

  it("perangkat desa tidak dapat menetapkan lokasi kantor", async () => {
    await masuk("dewi@anabanua.id");
    await expect(adminMock.updateOffice(KANTOR_USULAN)).rejects.toThrow(
      /Hanya sekretaris atau kepala desa/i,
    );
    expect((await attendanceMock.getActiveConfig()).office.name).toBe(
      SEED_CONFIG.office.name,
    );
  });

  it("koordinat dan radius mustahil ditolak dengan pesan yang jelas", async () => {
    await masuk("sekretaris@anabanua.id");
    await expect(
      adminMock.updateOffice({ ...KANTOR_USULAN, latitude: 91 }),
    ).rejects.toThrow(/lintang/i);
    await expect(
      adminMock.updateOffice({ ...KANTOR_USULAN, radiusMeters: 10 }),
    ).rejects.toThrow(/radius/i);
    await expect(
      adminMock.updateOffice({ ...KANTOR_USULAN, name: "  " }),
    ).rejects.toThrow(/nama kantor/i);
  });

  it("perubahan lokasi tercatat di audit sebagai MENGUBAH_KANTOR", async () => {
    await masuk("sekretaris@anabanua.id");
    await adminMock.updateOffice(KANTOR_USULAN);

    const logs = await adminMock.listAuditLogs();
    expect(logs.some((l) => l.action === "MENGUBAH_KANTOR")).toBe(true);
  });

  it("jumlah pengajuan menunggu dihitung dari pengajuan berstatus MENUNGGU", async () => {
    await masuk("sekretaris@anabanua.id");
    // Seed awal membawa pengajuan contoh berstatus MENUNGGU (seed-history).
    await expect(adminMock.jumlahPengajuanMenunggu()).resolves.toBe(2);
  });
});
describe("jam kerja baru langsung mengubah penilaian presensi", () => {
  /** Ubah jam kerja sebagai sekretaris, lalu buka sesi perangkat desa. */
  async function siapkanJadwal(): Promise<void> {
    await masuk("sekretaris@anabanua.id");
    await adminMock.updateSchedule(JADWAL_USULAN);
    await authMock.logout();
    await masuk("dewi@anabanua.id");
  }

  it("datang pukul 07.50 menjadi terlambat karena batas masuk 07.45", async () => {
    await siapkanJadwal();
    jam(7, 50);

    const hasil = await presensi("CHECK_IN");
    expect(hasil.accepted).toBe(true);
    // Batas masuk lama (08:00) masih menganggap ini tepat waktu — inilah bukti
    // bahwa yang dinilai adalah jadwal yang sedang berlaku.
    expect(hasil.attendance?.status).toBe("TERLAMBAT");
  });

  it("pulang pukul 15.40 kini tepat waktu karena jam pulang 15.30", async () => {
    await siapkanJadwal();
    await presensi("CHECK_IN");
    jam(15, 40);

    const hasil = await presensi("CHECK_OUT");
    expect(hasil.attendance?.status).toBe("TEPAT_WAKTU");
  });
});

describe("urutan presensi datang dan pulang", () => {
  it("datang sebelum batas masuk tercatat tepat waktu", async () => {
    await masuk("dewi@anabanua.id");
    const hasil = await presensi("CHECK_IN");

    expect(hasil.accepted).toBe(true);
    expect(hasil.attendance?.status).toBe("TEPAT_WAKTU");
    expect(hasil.attendance?.userId).toBe("u-dewi");
    // Datang lebih awal dari jam masuk pun tetap tepat waktu, bukan ditolak.
    expect(hasil.attendance?.verification.geofence.verdict).toBe("INSIDE");
  });

  it("datang melewati batas masuk tercatat terlambat", async () => {
    await masuk("dewi@anabanua.id");
    jam(8, 12);

    const hasil = await presensi("CHECK_IN");
    expect(hasil.attendance?.status).toBe("TERLAMBAT");
  });

  it("datang dua kali ditolak dan hari itu berstatus sudah masuk", async () => {
    await masuk("dewi@anabanua.id");
    await presensi("CHECK_IN");

    const lagi = await presensi("CHECK_IN");
    expect(lagi.accepted).toBe(false);
    expect(lagi.rejection?.code).toBe("SUDAH_PRESENSI");
    expect(lagi.rejection?.message).toMatch(/sudah tercatat/i);
    // Justru itulah keadaan yang dipakai panel untuk membuka pilihan pulang.
    expect((await attendanceMock.getTodayStatus("u-dewi")).kind).toBe(
      "SUDAH_CHECKIN",
    );
  });

  it("pulang ditolak bila belum ada presensi datang", async () => {
    await masuk("dewi@anabanua.id");

    const hasil = await presensi("CHECK_OUT");
    expect(hasil.accepted).toBe(false);
    expect(hasil.rejection?.code).toBe("BELUM_PRESENSI_MASUK");
    expect(hasil.rejection?.message).toMatch(/presensi datang terlebih dahulu/i);
  });

  it("setelah datang, pulang diterima dan hari itu lengkap", async () => {
    await masuk("dewi@anabanua.id");
    await presensi("CHECK_IN");
    jam(16, 30);

    const hasil = await presensi("CHECK_OUT");
    expect(hasil.accepted).toBe(true);
    expect(hasil.attendance?.status).toBe("TEPAT_WAKTU");

    const status = await attendanceMock.getTodayStatus("u-dewi");
    expect(status.kind).toBe("SELESAI");
    if (status.kind === "SELESAI") {
      expect(status.checkIn.type).toBe("CHECK_IN");
      expect(status.checkOut.type).toBe("CHECK_OUT");
      // Jam datang lebih awal daripada jam pulang — bukti dua transaksi
      // terpisah yang memang berurutan.
      expect(
        status.checkIn.verification.serverTime < status.checkOut.verification.serverTime,
      ).toBe(true);
    }

    // Dan pulang kedua kali tidak lagi diterima.
    const lagi = await presensi("CHECK_OUT");
    expect(lagi.rejection?.code).toBe("SUDAH_PRESENSI");
  });

  it("pulang sebelum jam pulang tercatat pulang cepat", async () => {
    await masuk("dewi@anabanua.id");
    await presensi("CHECK_IN");
    jam(15, 30);

    const hasil = await presensi("CHECK_OUT");
    expect(hasil.attendance?.status).toBe("PULANG_CEPAT");
  });
});

