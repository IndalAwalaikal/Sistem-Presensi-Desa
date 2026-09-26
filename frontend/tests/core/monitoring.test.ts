import { describe, expect, it } from "vitest";
import type { AttendanceListItem, WorkSchedule } from "@/core/domain/attendance";
import type { WorkRequest } from "@/core/domain/requests";
import type { User } from "@/core/domain/user";
import { ringkasMonitoring } from "@/core/usecase/monitoring";

const TANGGAL = "2026-09-14"; // Senin

const JADWAL: WorkSchedule = {
  id: "sch-1",
  name: "Jadwal Kantor (WITA)",
  checkInStart: "07:30",
  checkInDeadline: "08:00",
  checkOutStart: "16:00",
  checkOutEnd: "17:00",
  workDays: [1, 2, 3, 4, 5, 6],
};

/** `jam` menit WITA pada tanggal yang dipantau (2026-09-14). */
function wita(jam: number, menit = 0): Date {
  // 00:00 UTC = 08:00 WITA pada tanggal kalender yang sama.
  return new Date(Date.UTC(2026, 8, 14, jam - 8, menit));
}

function pengguna(
  id: string,
  accountStatus: User["accountStatus"] = "AKTIF",
): User {
  return {
    id,
    fullName: `Perangkat ${id}`,
    email: `${id}@anabanua.id`,
    role: "PERANGKAT_DESA",
    accountStatus,
    biometricStatus: "ACTIVE",
    official: {
      employeeId: "199001012020011001",
      position: "Staf Desa",
      unit: "Pemerintah Desa",
      phoneNumber: "",
      address: "",
    },
  };
}

function presensi(
  userId: string,
  status: AttendanceListItem["status"] = "TEPAT_WAKTU",
  type: AttendanceListItem["type"] = "CHECK_IN",
): AttendanceListItem {
  return {
    id: `att-${userId}-${type}`,
    userId,
    userName: `Perangkat ${userId}`,
    position: "Staf Desa",
    type,
    mode: "WFO",
    status,
    at: `${TANGGAL}T00:15:00Z`,
    // 0 = belum ada selisih tersimpan → monitoring menghitung ulang dari jadwal.
    selisihMenit: 0,
    distanceMeters: 12,
  };
}

function pengajuan(
  userId: string,
  type: WorkRequest["type"],
  startDate = TANGGAL,
  endDate = TANGGAL,
  status: WorkRequest["status"] = "DISETUJUI",
): WorkRequest {
  return {
    id: `req-${userId}-${type}`,
    type,
    userId,
    userName: `Perangkat ${userId}`,
    startDate,
    endDate,
    reason: "uji",
    status,
    createdAt: `${TANGGAL}T00:00:00Z`,
  };
}

describe("ringkasMonitoring", () => {
  it("sebelum batas masuk: belum presensi, tanpa keterangan masih nol", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2"), pengguna("u3")],
      presensi: [presensi("u1"), presensi("u2", "TERLAMBAT")],
      pengajuan: [],
      jadwal: JADWAL,
      sekarang: wita(7),
    });

    expect(hasil).toMatchObject({
      date: TANGGAL,
      totalPerangkat: 3,
      hariKerja: true,
      tutupBuku: false,
      hadir: 2,
      terlambat: 1,
      belumPresensi: 1,
      tanpaKeterangan: 0,
      wfh: 0,
      dinasLuar: 0,
      izinSakitCuti: 0,
    });
    expect(hasil.daftarTanpaKeterangan).toEqual([]);
  });

  it("setelah batas masuk: yang belum presensi dihitung tanpa keterangan", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2"), pengguna("u3")],
      presensi: [presensi("u1")],
      pengajuan: [],
      jadwal: JADWAL,
      sekarang: wita(9),
    });

    expect(hasil.tutupBuku).toBe(true);
    expect(hasil.hadir).toBe(1);
    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(2);
    expect(hasil.daftarTanpaKeterangan.map((p) => p.userId)).toEqual([
      "u2",
      "u3",
    ]);
  });

  it("mengeluarkan pemohon izin dari hitungan hadir", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2")],
      presensi: [presensi("u1"), presensi("u2")],
      pengajuan: [pengajuan("u2", "IZIN")],
      jadwal: JADWAL,
      sekarang: wita(9),
    });

    expect(hasil.hadir).toBe(1);
    expect(hasil.izinSakitCuti).toBe(1);
    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(0);
  });

  it("menghitung WFH dan dinas luar terpisah, bukan sebagai izin", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2"), pengguna("u3")],
      presensi: [],
      pengajuan: [pengajuan("u2", "WFH"), pengajuan("u3", "DINAS_LUAR")],
      jadwal: JADWAL,
      sekarang: wita(7),
    });

    expect(hasil.wfh).toBe(1);
    expect(hasil.dinasLuar).toBe(1);
    expect(hasil.izinSakitCuti).toBe(0);
    // Sebelum batas masuk semua masih "belum presensi" — WFH/dinas luar tidak
    // menutup kewajiban presensi.
    expect(hasil.belumPresensi).toBe(3);
    expect(hasil.tanpaKeterangan).toBe(0);
  });

  it("WFH tidak menutup hari: setelah batas masuk tetap tanpa keterangan", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2")],
      presensi: [],
      pengajuan: [pengajuan("u2", "WFH")],
      jadwal: JADWAL,
      sekarang: wita(9),
    });

    expect(hasil.wfh).toBe(1);
    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(2);
    expect(hasil.daftarTanpaKeterangan.map((p) => p.userId)).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("hari kemarin tanpa presensi langsung tanpa keterangan", () => {
    const hasil = ringkasMonitoring({
      tanggal: "2026-09-11", // Jumat, tiga hari sebelum "sekarang"
      pengguna: [pengguna("u1"), pengguna("u2")],
      presensi: [],
      pengajuan: [],
      jadwal: JADWAL,
      sekarang: wita(9),
    });

    expect(hasil.hariKerja).toBe(true);
    expect(hasil.tutupBuku).toBe(true);
    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(2);
  });

  it("hari libur tidak menuntut presensi sama sekali", () => {
    const hasil = ringkasMonitoring({
      tanggal: "2026-09-13", // Minggu — bukan hari kerja
      pengguna: [pengguna("u1"), pengguna("u2")],
      presensi: [],
      pengajuan: [],
      jadwal: JADWAL,
      sekarang: new Date(Date.UTC(2026, 8, 13, 1)), // 09.00 WITA
    });

    expect(hasil.hariKerja).toBe(false);
    expect(hasil.tutupBuku).toBe(false);
    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(0);
    expect(hasil.totalPerangkat).toBe(2);
  });

  it("libur nasional pada hari kerja: tidak ada yang dihitung tanpa keterangan", () => {
    const hasil = ringkasMonitoring({
      tanggal: "2026-09-19", // Sabtu menurut jadwal, tetapi diliburkan
      pengguna: [pengguna("u1"), pengguna("u2")],
      presensi: [],
      pengajuan: [],
      jadwal: JADWAL,
      libur: new Set(["2026-09-19"]),
      sekarang: new Date(Date.UTC(2026, 8, 19, 1)), // 09.00 WITA, batas masuk sudah lewat
    });

    expect(hasil.hariKerja).toBe(false);
    expect(hasil.tutupBuku).toBe(false);
    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(0);
    expect(hasil.daftarTanpaKeterangan).toEqual([]);
  });

  it("hari kerja yang tidak diliburkan tetap menuntut presensi", () => {
    const hasil = ringkasMonitoring({
      tanggal: "2026-09-19",
      pengguna: [pengguna("u1")],
      presensi: [],
      pengajuan: [],
      jadwal: JADWAL,
      libur: new Set(["2026-09-18"]), // libur di tanggal lain
      sekarang: new Date(Date.UTC(2026, 8, 19, 1)),
    });

    expect(hasil.hariKerja).toBe(true);
    expect(hasil.tutupBuku).toBe(true);
    expect(hasil.tanpaKeterangan).toBe(1);
  });

  it("hanya menghitung pengajuan yang menutup tanggal ringkasan", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2")],
      presensi: [],
      pengajuan: [
        pengajuan("u1", "CUTI", "2026-09-01", "2026-09-10"), // sudah lewat
        pengajuan("u2", "CUTI", "2026-09-15", "2026-09-20"), // belum mulai
      ],
      jadwal: JADWAL,
      sekarang: wita(7),
    });

    expect(hasil.izinSakitCuti).toBe(0);
    expect(hasil.belumPresensi).toBe(2);
  });

  it("mengabaikan pengajuan yang belum disetujui dan akun nonaktif", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1"), pengguna("u2", "NONAKTIF")],
      presensi: [presensi("u1")],
      pengajuan: [pengajuan("u1", "SAKIT", TANGGAL, TANGGAL, "MENUNGGU")],
      jadwal: JADWAL,
      sekarang: wita(7),
    });

    expect(hasil.totalPerangkat).toBe(1);
    expect(hasil.hadir).toBe(1);
    expect(hasil.izinSakitCuti).toBe(0);
    expect(hasil.belumPresensi).toBe(0);
  });

  it("tidak menghasilkan belum presensi negatif", () => {
    const hasil = ringkasMonitoring({
      tanggal: TANGGAL,
      pengguna: [pengguna("u1")],
      presensi: [presensi("u1"), presensi("u1", "PULANG_CEPAT", "CHECK_OUT")],
      pengajuan: [pengajuan("u1", "IZIN")],
      jadwal: JADWAL,
      sekarang: wita(9),
    });

    expect(hasil.belumPresensi).toBe(0);
    expect(hasil.tanpaKeterangan).toBe(0);
  });
});
