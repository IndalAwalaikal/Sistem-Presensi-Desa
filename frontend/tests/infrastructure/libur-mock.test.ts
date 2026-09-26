import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminMock } from "@/infrastructure/mock/gateways/admin";
import { authMock } from "@/infrastructure/mock/gateways/auth";
import { liburMock } from "@/infrastructure/mock/gateways/libur";
import { KATA_SANDI_DEMO } from "@/infrastructure/mock/seed-users";
import { muat, resetSimpanan, simpan } from "@/infrastructure/mock/store";

/**
 * Kalender hari libur pada data contoh. Melengkapi uji aturan murni di
 * `tests/core/libur.test.ts`: yang diuji di sini adalah perilaku pintu data yang
 * menjadi acuan kontrak backend — kalender bawaan yang terbaca semua pengguna,
 * penambahan libur lokal oleh pengelola akun beserta jejak auditnya, penarikan
 * kalender resmi yang tidak menimpa catatan desa, dan pengaruhnya pada rekap
 * bulanan (hari libur tidak pernah menjadi "tanpa keterangan").
 *
 * Waktu dibekukan pada Kamis 10 September 2026 supaya rekap Agustus 2026 selalu
 * "tutup buku" dan hasilnya tidak bergantung kapan uji ini dijalankan.
 */

async function masuk(email: string): Promise<void> {
  await authMock.login({ email, password: KATA_SANDI_DEMO });
}

async function tanpaKeterangan(userId: string): Promise<number> {
  const baris = await adminMock.getMonthlyRecap(2026, 8);
  const milik = baris.find((b) => b.userId === userId);
  if (!milik) throw new Error(`baris rekap ${userId} tidak ada`);
  return milik.tanpaKeterangan;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 10, 7, 40, 0));
  resetSimpanan();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("kalender bawaan", () => {
  it("berisi libur nasional & cuti bersama 2026, terurut menurut tanggal", async () => {
    await masuk("dewi@anabanua.id");
    const hari = await liburMock.tahun(2026);

    // 17 libur nasional + 8 cuti bersama menurut SKB tiga menteri 2026.
    expect(hari).toHaveLength(25);
    const proklamasi = hari.find((h) => h.tanggal === "2026-08-17");
    expect(proklamasi?.nama).toMatch(/Proklamasi/i);
    expect(proklamasi?.jenis).toBe("LIBUR_NASIONAL");
    expect(hari.find((h) => h.tanggal === "2026-12-24")?.jenis).toBe("CUTI_BERSAMA");

    const tanggal = hari.map((h) => h.tanggal);
    expect([...tanggal].sort()).toEqual(tanggal);
  });

  it("dibaca perangkat biasa — kalender desa bukan data administrasi", async () => {
    await masuk("ahmad@anabanua.id");
    expect(await liburMock.tahun(2026)).toHaveLength(25);
    // Tahun yang tidak punya daftar tetap menjawab, hanya kosong.
    expect(await liburMock.tahun(2027)).toEqual([]);
  });
});

describe("penetapan hari libur oleh pengelola", () => {
  it("perangkat desa tidak dapat menambah, menghapus, atau menarik kalender", async () => {
    await masuk("dewi@anabanua.id");
    await expect(
      liburMock.simpan({ tanggal: "2026-09-02", nama: "Libur desa" }),
    ).rejects.toThrow(/Hanya sekretaris atau kepala desa/i);
    await expect(liburMock.hapus("2026-08-17")).rejects.toThrow(
      /Hanya sekretaris atau kepala desa/i,
    );
    await expect(liburMock.impor(2026)).rejects.toThrow(
      /Hanya sekretaris atau kepala desa/i,
    );
    // Kalender yang berlaku tidak berubah oleh percobaan itu.
    expect(await liburMock.tahun(2026)).toHaveLength(25);
  });

  it("sekretaris menambah libur lokal: bawaannya libur lokal dan tercatat di audit", async () => {
    await masuk("sekretaris@anabanua.id");
    const baru = await liburMock.simpan({
      tanggal: "2026-09-02",
      nama: "Hari Jadi Desa Anabanua",
    });

    expect(baru.jenis).toBe("LIBUR_LOKAL");
    expect(baru.sumber).toBe("MANUAL");
    expect((await liburMock.tahun(2026)).map((h) => h.tanggal)).toContain("2026-09-02");

    const audit = await adminMock.listAuditLogs();
    expect(audit[0].action).toBe("MENAMBAH_HARI_LIBUR");
    expect(audit[0].detail).toMatch(/Hari Jadi Desa Anabanua/);
  });

  it("menyimpan tanggal yang sama berarti mengubah, bukan menambah", async () => {
    await masuk("kepala@anabanua.id");
    await liburMock.simpan({ tanggal: "2026-08-17", nama: "HUT RI (versi desa)" });

    const hasil = await liburMock.simpan({
      tanggal: "2026-08-17",
      nama: "HUT Kemerdekaan RI",
      jenis: "LIBUR_LOKAL",
    });
    expect(hasil.nama).toBe("HUT Kemerdekaan RI");
    expect(hasil.jenis).toBe("LIBUR_LOKAL");
    // Satu tanggal hanya sekali pada kalender.
    const agustus = (await liburMock.tahun(2026)).filter(
      (h) => h.tanggal === "2026-08-17",
    );
    expect(agustus).toHaveLength(1);

    const audit = await adminMock.listAuditLogs();
    expect(audit[0].action).toBe("MENGUBAH_HARI_LIBUR");
  });

  it("hapus membuang tanggal; mengulanginya ditolak", async () => {
    await masuk("sekretaris@anabanua.id");
    await liburMock.hapus("2026-12-24");

    const tanggal = (await liburMock.tahun(2026)).map((h) => h.tanggal);
    expect(tanggal).not.toContain("2026-12-24");
    expect((await adminMock.listAuditLogs())[0].action).toBe("MENGHAPUS_HARI_LIBUR");
    await expect(liburMock.hapus("2026-12-24")).rejects.toThrow(/bukan hari libur/i);
  });

  it("isian rusak ditolak sebelum tersimpan", async () => {
    await masuk("sekretaris@anabanua.id");
    await expect(
      liburMock.simpan({ tanggal: "2026-02-30", nama: "Salah ketik" }),
    ).rejects.toThrow(/format YYYY-MM-DD/i);
    await expect(
      liburMock.simpan({ tanggal: "2026-09-02", nama: "   " }),
    ).rejects.toThrow(/wajib diisi/i);
  });
});

describe("penarikan kalender resmi", () => {
  it("mengisi kalender dan mempertahankan catatan yang ditetapkan desa", async () => {
    await masuk("sekretaris@anabanua.id");
    // Catatan desa untuk 17 Agustus: nama dan jenisnya berbeda dari bawaan.
    await liburMock.simpan({
      tanggal: "2026-08-17",
      nama: "HUT RI — upacara desa",
      jenis: "LIBUR_LOKAL",
    });
    await liburMock.hapus("2026-05-01"); // satu tanggal bawaan dihapus

    const hasil = await liburMock.impor(2026);
    expect(hasil.tahun).toBe(2026);
    expect(hasil.diabaikan).toBe(1); // catatan desa tidak ditimpa
    expect(hasil.baru).toBe(1); // tanggal yang tadi dihapus kembali terisi
    expect(hasil.hari).toHaveLength(25);

    const agustus = hasil.hari.find((h) => h.tanggal === "2026-08-17");
    expect(agustus?.nama).toBe("HUT RI — upacara desa");
    expect(agustus?.sumber).toBe("MANUAL");
    expect(hasil.hari.find((h) => h.tanggal === "2026-05-01")?.sumber).toBe("IMPOR");
  });

  it("tahun tanpa daftar bawaan ditolak dengan keterangan", async () => {
    await masuk("kepala@anabanua.id");
    await expect(liburMock.impor(2027)).rejects.toThrow(/belum ada daftar bawaan/i);
  });
});

describe("pengaruh hari libur pada rekap bulanan", () => {
  it("hari libur yang dihapus menambah tepat satu hari tanpa keterangan", async () => {
    await masuk("sekretaris@anabanua.id");

    // Kosongkan presensi seorang perangkat supaya seluruh hari kerja Agustus
    // yang sudah tutup buku memang tanpa presensi — yang diuji bukan data
    // contoh presensinya, melainkan pengaruh kalender libur.
    const db = muat();
    db.attendance = db.attendance.filter((a) => a.userId !== "u-ahmad");
    simpan();

    const denganLibur = await tanpaKeterangan("u-ahmad");
    await liburMock.hapus("2026-08-17"); // Senin, libur nasional bawaan
    const tanpaLibur = await tanpaKeterangan("u-ahmad");

    expect(tanpaLibur).toBe(denganLibur + 1);
  });
});
