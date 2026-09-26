import { describe, expect, it } from "vitest";
import type { WorkSchedule } from "@/core/domain/attendance";
import type { WorkRequest } from "@/core/domain/requests";
import {
  hariDariIso,
  hariDijelaskan,
  hariKerjaBulan,
  hariKerjaTertutup,
  hitungHariPengajuanBulan,
  isHariKerjaEfektifIso,
  isHariKerjaIso,
  lewatBatasMasuk,
  tanpaKeteranganBulan,
} from "@/core/usecase/kehadiran";

const JADWAL: WorkSchedule = {
  id: "sch-1",
  name: "Jadwal Kantor (WITA)",
  checkInStart: "07:30",
  checkInDeadline: "08:00",
  checkOutStart: "16:00",
  checkOutEnd: "17:00",
  workDays: [1, 2, 3, 4, 5, 6],
};

/** Kalender libur kosong: hanya akhir pekan yang dikecualikan. */
const LIBUR_KOSONG: ReadonlySet<string> = new Set<string>();

/**
 * Kalender libur uji: satu libur nasional (Rabu 2 September) dan satu cuti
 * bersama (Jumat 4 September) — keduanya hari kerja menurut jadwal.
 */
const LIBUR: ReadonlySet<string> = new Set(["2026-09-02", "2026-09-04"]);

/** Waktu WITA pada 14 September 2026 (Senin, hari kerja). */
function witaSenin(jam: number, menit = 0): Date {
  // 00:00 UTC = 08:00 WITA pada tanggal kalender yang sama.
  return new Date(Date.UTC(2026, 8, 14, jam - 8, menit));
}

function pengajuan(
  tipe: WorkRequest["type"],
  startDate: string,
  endDate: string,
  status: WorkRequest["status"] = "DISETUJUI",
): WorkRequest {
  return {
    id: `req-${tipe}`,
    type: tipe,
    userId: "u1",
    userName: "Perangkat u1",
    startDate,
    endDate,
    reason: "uji",
    status,
    createdAt: "2026-09-01T00:00:00Z",
  };
}

describe("hari kerja tertutup", () => {
  it("sebelum batas masuk, hari ini belum ditutup", () => {
    const hari = hariKerjaTertutup(2026, 9, JADWAL, LIBUR_KOSONG, witaSenin(7, 30));
    // 1–5, 7–13 September (6 & 13 = Minggu) tanpa 14 = 11 hari.
    expect(hari).toHaveLength(11);
    expect(hari[hari.length - 1]).toBe("2026-09-12");
  });

  it("tepat batas masuk sudah ditutup", () => {
    const hari = hariKerjaTertutup(2026, 9, JADWAL, LIBUR_KOSONG, witaSenin(8, 0));
    expect(hari).toHaveLength(12);
    expect(hari[hari.length - 1]).toBe("2026-09-14");
  });

  it("Minggu tidak pernah masuk daftar", () => {
    const hari = hariKerjaTertutup(2026, 9, JADWAL, LIBUR_KOSONG, witaSenin(9));
    expect(hari).not.toContain("2026-09-06");
    expect(hari).not.toContain("2026-09-13");
  });

  it("bulan yang belum berjalan kosong", () => {
    expect(hariKerjaTertutup(2026, 12, JADWAL, LIBUR_KOSONG, witaSenin(9))).toEqual([]);
  });

  it("hari libur menurut jadwal bukan hari kerja", () => {
    expect(isHariKerjaIso(JADWAL, "2026-09-13")).toBe(false); // Minggu
    expect(isHariKerjaIso(JADWAL, "2026-09-12")).toBe(true); // Sabtu
    expect(hariDariIso("2026-09-14")).toBe(1); // Senin
  });

  it("batas masuk dihitung dari jam, bukan menit yang salah baca", () => {
    expect(lewatBatasMasuk(JADWAL, witaSenin(7, 59))).toBe(false);
    expect(lewatBatasMasuk(JADWAL, witaSenin(8, 0))).toBe(true);
  });
});

describe("hari libur tidak menuntut presensi", () => {
  it("tanggal libur tidak masuk hari kerja tertutup", () => {
    const hari = hariKerjaTertutup(2026, 9, JADWAL, LIBUR, witaSenin(9));
    // 12 hari kerja tertutup tanpa libur → 10 hari setelah 2 tanggal diliburkan.
    expect(hari).toHaveLength(10);
    expect(hari).not.toContain("2026-09-02"); // libur nasional
    expect(hari).not.toContain("2026-09-04"); // cuti bersama
    expect(hari).toContain("2026-09-03"); // hari kerja biasa tetap dihitung
  });

  it("hari kerja efektif = hari kerja jadwal dan bukan libur", () => {
    expect(isHariKerjaEfektifIso(JADWAL, LIBUR, "2026-09-02")).toBe(false);
    expect(isHariKerjaEfektifIso(JADWAL, LIBUR, "2026-09-06")).toBe(false); // Minggu
    expect(isHariKerjaEfektifIso(JADWAL, LIBUR, "2026-09-03")).toBe(true);
    // Kalender belum dimuat: hanya akhir pekan yang dikecualikan.
    expect(isHariKerjaEfektifIso(JADWAL, undefined, "2026-09-02")).toBe(true);
  });

  it("kalender libur mengurangi angka tanpa keterangan satu bulan", () => {
    const bahan = {
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      sekarang: witaSenin(9),
      hadir: new Set<string>(),
      dijelaskan: new Set<string>(),
    };
    expect(tanpaKeteranganBulan(bahan)).toBe(12);
    expect(tanpaKeteranganBulan({ ...bahan, libur: LIBUR })).toBe(10);
  });
});

describe("hari kerja satu bulan (penyebut dashboard)", () => {
  it("menghitung sampai tanggal batas dan melewati hari libur", () => {
    const hari = hariKerjaBulan(2026, 9, JADWAL, LIBUR, "2026-09-14");
    // 1–14 September: 14 hari − 2 Minggu (6, 13) − 2 libur (2, 4) = 10 hari.
    expect(hari).toHaveLength(10);
    expect(hari).not.toContain("2026-09-06"); // Minggu
    expect(hari).not.toContain("2026-09-02"); // libur nasional
    expect(hari[hari.length - 1]).toBe("2026-09-14");
  });

  it("berhenti pada tanggal batas, bukan mengisi satu bulan penuh", () => {
    expect(hariKerjaBulan(2026, 9, JADWAL, undefined, "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("bulan yang belum berjalan kosong", () => {
    expect(hariKerjaBulan(2026, 10, JADWAL, undefined, "2026-09-14")).toEqual([]);
  });
});

describe("tanpa keterangan satu bulan", () => {
  it("hari tanpa presensi dan tanpa izin dihitung; yang hadir/tutup tidak", () => {
    const n = tanpaKeteranganBulan({
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      sekarang: witaSenin(9),
      hadir: new Set(["2026-09-01"]),
      dijelaskan: new Set(["2026-09-03"]),
      sejak: undefined,
    });
    // 12 hari tertutup: 1 hadir, 1 dijelaskan → 10 hari tanpa keterangan.
    expect(n).toBe(10);
  });

  it("hari sebelum akun dibuat tidak dihitung", () => {
    const tanpaSejak = tanpaKeteranganBulan({
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      sekarang: witaSenin(9),
      hadir: new Set(),
      dijelaskan: new Set(),
      sejak: "2026-09-08",
    });
    // Hari tertutup ≥ 8 September: 8–12 & 14 = 6 hari.
    expect(tanpaSejak).toBe(6);
  });

  it("tanpa bahan apa pun, semua hari tertutup dihitung", () => {
    const n = tanpaKeteranganBulan({
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      sekarang: witaSenin(9),
      hadir: new Set(),
      dijelaskan: new Set(),
    });
    expect(n).toBe(12);
  });
});

describe("hari dijelaskan pengajuan", () => {
  it("izin/sakit/cuti disetujui menutup rentangnya", () => {
    const hari = hariDijelaskan([
      pengajuan("IZIN", "2026-09-04", "2026-09-04"),
      pengajuan("CUTI", "2026-09-10", "2026-09-12"),
    ]);
    expect(hari.has("2026-09-04")).toBe(true);
    expect(hari.has("2026-09-10")).toBe(true);
    expect(hari.has("2026-09-11")).toBe(true);
    expect(hari.has("2026-09-12")).toBe(true);
    expect(hari.has("2026-09-13")).toBe(false);
  });

  it("WFH, dinas luar, dan pengajuan menunggu tidak menjelaskan apa pun", () => {
    const hari = hariDijelaskan([
      pengajuan("WFH", "2026-09-04", "2026-09-04"),
      pengajuan("DINAS_LUAR", "2026-09-04", "2026-09-04"),
      pengajuan("KOREKSI_PRESENSI", "2026-09-04", "2026-09-04"),
      pengajuan("IZIN", "2026-09-05", "2026-09-05", "MENUNGGU"),
    ]);
    expect(hari.size).toBe(0);
  });

  it("rentang rusak menghasilkan daftar kosong", () => {
    const hari = hariDijelaskan([
      pengajuan("IZIN", "2026-09-06", "2026-09-04"),
      pengajuan("IZIN", "bukan-tanggal", "2026-09-04"),
    ]);
    expect(hari.size).toBe(0);
  });
});

/**
 * Rekap bulanan melaporkan BERAPA HARI perangkat diizinkan tidak hadir, bukan
 * berapa berkas pengajuan: satu cuti lima hari bukan satu hari, dan cuti yang
 * menggulung dari bulan lalu tetap menyumbang hari-hari di bulan ini (kueri
 * YEAR(mulai)/MONTH(mulai) lama membuat keduanya hilang).
 */
describe("jumlah hari pengajuan satu bulan (rekap)", () => {
  it("menghitung hari kerja yang dicakup, bukan jumlah berkas pengajuan", () => {
    const n = hitungHariPengajuanBulan({
      pengajuan: [pengajuan("CUTI", "2026-09-04", "2026-09-08")],
      tipe: "CUTI",
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      libur: LIBUR_KOSONG,
    });
    // 4 (Jumat), 5 (Sabtu), 7 (Senin), 8 (Selasa); 6 = Minggu.
    expect(n).toBe(4);
  });

  it("pengajuan lintas bulan hanya menyumbang hari di bulan ini", () => {
    const n = hitungHariPengajuanBulan({
      pengajuan: [pengajuan("SAKIT", "2026-08-30", "2026-09-02")],
      tipe: "SAKIT",
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      libur: LIBUR_KOSONG,
    });
    expect(n).toBe(2); // 1 & 2 September saja.
  });

  it("hari libur tidak menambah angka izin", () => {
    const bahan = {
      pengajuan: [pengajuan("IZIN", "2026-09-01", "2026-09-04")],
      tipe: "IZIN" as const,
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
    };
    expect(hitungHariPengajuanBulan({ ...bahan, libur: LIBUR_KOSONG })).toBe(4);
    expect(hitungHariPengajuanBulan({ ...bahan, libur: LIBUR })).toBe(2);
  });

  it("mengabaikan tipe lain, pengajuan belum disetujui, dan rentang rusak", () => {
    const n = hitungHariPengajuanBulan({
      pengajuan: [
        pengajuan("IZIN", "2026-09-01", "2026-09-02"),
        pengajuan("WFH", "2026-09-01", "2026-09-30"),
        pengajuan("IZIN", "2026-09-06", "2026-09-04"),
        pengajuan("IZIN", "2026-09-08", "2026-09-09", "MENUNGGU"),
      ],
      tipe: "IZIN",
      tahun: 2026,
      bulan: 9,
      jadwal: JADWAL,
      libur: LIBUR_KOSONG,
    });
    expect(n).toBe(2);
  });
});
