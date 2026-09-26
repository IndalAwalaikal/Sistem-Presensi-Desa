import { beforeEach, describe, expect, it } from "vitest";
import { authMock } from "@/infrastructure/mock/gateways/auth";
import { adminMock } from "@/infrastructure/mock/gateways/admin";
import {
  KATA_SANDI_DEMO,
  KODE_UNDANGAN_DEMO,
} from "@/infrastructure/mock/seed-users";
import { muat, resetSimpanan } from "@/infrastructure/mock/store";
import { undanganSah } from "@/core/domain/undangan";

/**
 * Alur registrasi perangkat desa pada data contoh, dari pembuatan akun oleh
 * sekretaris desa sampai presensi pertama dapat dibuka. Penegasan ini melengkapi
 * uji aturan murni di `tests/core/akun.test.ts`: yang diuji di sini adalah
 * perilaku pintu data (mock) yang sekarang menjadi acuan kontrak backend.
 */

const AKTIVASI_NURUL = {
  password: "anabanua2026",
  phoneNumber: "0852-4000-5005",
  address: "Desa Anabanua, Kec. Barru",
  consentBiometrik: true,
};

beforeEach(() => {
  resetSimpanan();
});

describe("masuk sebelum aktivasi", () => {
  it("ditolak dengan alasan yang jelas", async () => {
    await expect(
      authMock.login({ email: "nurul@anabanua.id", password: KATA_SANDI_DEMO }),
    ).rejects.toThrow(/belum diaktivasi/i);
  });
});

describe("aktivasi dengan kode undangan", () => {
  it("membuka akun, mencatat data mandiri dan persetujuan, lalu membuka sesi", async () => {
    const undangan = await authMock.getUndangan(KODE_UNDANGAN_DEMO);
    expect(undangan?.userId).toBe("u-nurul");

    const user = await authMock.aktifkan(KODE_UNDANGAN_DEMO, AKTIVASI_NURUL);
    expect(user.accountStatus).toBe("AKTIF");
    expect(user.biometricStatus).toBe("NOT_ENROLLED");
    expect(user.official.phoneNumber).toBe("0852-4000-5005");
    expect(user.biometricConsentAt).toBeTruthy();

    // Sesi langsung terbuka; pengguna tinggal melanjutkan ke pendaftaran wajah.
    expect((await authMock.getCurrentUser())?.id).toBe("u-nurul");
    // Dan kata sandi barunya memang berlaku.
    await authMock.logout();
    expect((await authMock.login({ email: "nurul@anabanua.id", password: AKTIVASI_NURUL.password })).id).toBe(
      "u-nurul",
    );
  });

  it("menerima kode yang ditulis dengan huruf kecil dan berspasi", async () => {
    const user = await authMock.aktifkan(` ${KODE_UNDANGAN_DEMO.toLowerCase()} `, AKTIVASI_NURUL);
    expect(user.accountStatus).toBe("AKTIF");
  });

  it("menolak kode yang tidak dikenal", async () => {
    await expect(authMock.aktifkan("ANB-XXXX-YYYY", AKTIVASI_NURUL)).rejects.toThrow(
      /tidak dikenal/i,
    );
  });

  it("menolak pemakaian kedua atas kode yang sama", async () => {
    await authMock.aktifkan(KODE_UNDANGAN_DEMO, AKTIVASI_NURUL);
    await expect(authMock.aktifkan(KODE_UNDANGAN_DEMO, AKTIVASI_NURUL)).rejects.toThrow(
      /sudah pernah dipakai/i,
    );
  });

  it("menolak kode yang sudah kedaluwarsa", async () => {
    const db = muat();
    db.undangan = db.undangan.map((u) => ({
      ...u,
      kedaluwarsaPada: new Date(Date.now() - 1_000).toISOString(),
    }));
    await expect(authMock.aktifkan(KODE_UNDANGAN_DEMO, AKTIVASI_NURUL)).rejects.toThrow(
      /kedaluwarsa/i,
    );
  });

  it("menolak aktivasi tanpa persetujuan pemrosesan data wajah", async () => {
    await expect(
      authMock.aktifkan(KODE_UNDANGAN_DEMO, { ...AKTIVASI_NURUL, consentBiometrik: false }),
    ).rejects.toThrow(/persetujuan/i);
  });
});
describe("pembuatan akun oleh sekretaris desa", () => {
  const AKUN_BARU = {
    fullName: "Fatimah Sari",
    email: "fatimah@anabanua.id",
    employeeId: "19980103 202203 2 021",
    position: "Staf Administrasi",
    unit: "Sekretariat Desa",
    role: "PERANGKAT_DESA" as const,
  };

  async function masukSekretaris() {
    await authMock.login({ email: "sekretaris@anabanua.id", password: KATA_SANDI_DEMO });
  }

  it("membuat akun tanpa kata sandi, berstatus undangan, dan berkode sekali pakai", async () => {
    await masukSekretaris();
    const hasil = await adminMock.createUser(AKUN_BARU);

    expect(hasil.user.accountStatus).toBe("UNDANGAN");
    expect(hasil.user.biometricStatus).toBe("NOT_ENROLLED");
    expect(hasil.undangan.kode).toMatch(/^ANB-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(undanganSah(hasil.undangan)).toBe(true);

    // Belum dapat masuk sebelum diaktivasi.
    await authMock.logout();
    await expect(
      authMock.login({ email: AKUN_BARU.email, password: "apa-saja-123" }),
    ).rejects.toThrow(/belum diaktivasi/i);

    // Setelah aktivasi dengan kode itu, akun berjalan normal.
    const user = await authMock.aktifkan(hasil.undangan.kode, AKTIVASI_NURUL);
    expect(user.id).toBe(hasil.user.id);
    expect(user.accountStatus).toBe("AKTIF");
  });

  it("menolak email dinas yang sudah dipakai", async () => {
    await masukSekretaris();
    await expect(
      adminMock.createUser({ ...AKUN_BARU, email: "ahmad@anabanua.id" }),
    ).rejects.toThrow(/sudah dipakai/i);
  });

  it("menolak NIP yang sudah terdaftar", async () => {
    await masukSekretaris();
    await expect(
      adminMock.createUser({ ...AKUN_BARU, employeeId: "19870412 201003 2 004" }),
    ).rejects.toThrow(/NIP/i);
  });

  it("menolak pembuatan akun administratif dari halaman pengguna", async () => {
    await masukSekretaris();
    // Hanya akun perangkat desa yang boleh diterbitkan dari aplikasi. Akun
    // sekretaris dan kepala desa jumlahnya tetap dua dan ditetapkan di basis data.
    await expect(
      adminMock.createUser({ ...AKUN_BARU, role: "KEPALA_DESA" }),
    ).rejects.toThrow(/tidak dapat dibuat/i);
    await expect(
      adminMock.createUser({ ...AKUN_BARU, role: "SEKRETARIS_DESA" }),
    ).rejects.toThrow(/tidak dapat dibuat/i);
  });
});

describe("pengelolaan akun", () => {
  async function masukSekretaris() {
    await authMock.login({ email: "sekretaris@anabanua.id", password: KATA_SANDI_DEMO });
  }

  it("reset kata sandi menggugurkan sandi lama dan menerbitkan kode baru", async () => {
    await masukSekretaris();
    const hasil = await adminMock.resetPassword("u-ahmad");
    expect(hasil.user.accountStatus).toBe("UNDANGAN");
    expect(hasil.undangan.userId).toBe("u-ahmad");

    await authMock.logout();
    await expect(
      authMock.login({ email: "ahmad@anabanua.id", password: KATA_SANDI_DEMO }),
    ).rejects.toThrow(/belum diaktivasi/i);

    const user = await authMock.aktifkan(hasil.undangan.kode, AKTIVASI_NURUL);
    expect(user.accountStatus).toBe("AKTIF");
  });

  it("menonaktifkan akun menggugurkan kode undangan yang belum dipakai", async () => {
    await masukSekretaris();
    const hasil = await adminMock.resetPassword("u-budi");
    await adminMock.setAccountStatus("u-budi", "NONAKTIF");

    const kode = await authMock.getUndangan(hasil.undangan.kode);
    expect(undanganSah(kode)).toBe(false);

    await authMock.logout();
    await expect(
      authMock.login({ email: "budi@anabanua.id", password: KATA_SANDI_DEMO }),
    ).rejects.toThrow(/dinonaktifkan/i);
  });

  it("sekretaris desa tidak dapat mengelola akun kepala desa", async () => {
    await masukSekretaris();
    await expect(adminMock.setAccountStatus("u-kepala", "NONAKTIF")).rejects.toThrow(
      /tidak dapat dikelola/i,
    );
    await expect(adminMock.resetPassword("u-kepala")).rejects.toThrow(
      /tidak dapat dikelola/i,
    );
  });

  it("kepala desa tidak dapat mengelola akun sekretaris desa", async () => {
    await masukSekretaris();
    await authMock.logout();
    await authMock.login({ email: "kepala@anabanua.id", password: KATA_SANDI_DEMO });
    await expect(
      adminMock.setAccountStatus("u-sekretaris", "NONAKTIF"),
    ).rejects.toThrow(/tidak dapat dikelola/i);
  });

  it("tidak dapat menonaktifkan akun sendiri", async () => {
    await masukSekretaris();
    await expect(adminMock.setAccountStatus("u-sekretaris", "NONAKTIF")).rejects.toThrow(
      /sendiri/i,
    );
  });
});