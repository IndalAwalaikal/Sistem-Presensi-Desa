import { beforeEach, describe, expect, it } from "vitest";
import { authMock } from "@/infrastructure/mock/gateways/auth";
import { profilMock } from "@/infrastructure/mock/gateways/profil";
import { KATA_SANDI_DEMO } from "@/infrastructure/mock/seed-users";
import { muat, resetSimpanan } from "@/infrastructure/mock/store";

/**
 * Perilaku pintu data profil pemilik akun (mock) — acuan kontrak backend
 * (internal/usecase/profil.go). Yang ditegaskan di sini: kontak dan kata sandi
 * dapat diurus sendiri, identitas kepegawaian tidak.
 */

beforeEach(() => {
  resetSimpanan();
});

async function masukPerangkat() {
  return authMock.login({ email: "ahmad@anabanua.id", password: KATA_SANDI_DEMO });
}

describe("perbarui kontak sendiri", () => {
  it("menyimpan telepon & alamat dan mengembalikan pengguna terbaru", async () => {
    await masukPerangkat();

    const user = await profilMock.perbaruiKontak({
      phoneNumber: "0852-4000-9001",
      address: "Dusun Anabanua, Kec. Barru",
    });
    expect(user.official.phoneNumber).toBe("0852-4000-9001");
    expect(user.official.address).toBe("Dusun Anabanua, Kec. Barru");

    // Sesi membaca ulang nilai yang sama.
    const saya = await authMock.getCurrentUser();
    expect(saya?.official.phoneNumber).toBe("0852-4000-9001");
  });

  it("mencatat perubahan pada jejak audit", async () => {
    await masukPerangkat();
    await profilMock.perbaruiKontak({ phoneNumber: "0852-4000-9001", address: "Dusun Anabanua" });

    const log = muat().auditLogs[0];
    expect(log.action).toBe("MEMPERBARUI_KONTAK");
    expect(log.actorId).toBe("u-ahmad");
  });

  it("menolak kontak yang tidak masuk akal", async () => {
    await masukPerangkat();
    await expect(
      profilMock.perbaruiKontak({ phoneNumber: "12", address: "Desa Anabanua" }),
    ).rejects.toThrow(/telepon/i);
    await expect(
      profilMock.perbaruiKontak({ phoneNumber: "0852-4000-1001", address: "Barru" }),
    ).rejects.toThrow(/alamat/i);
  });

  it("tidak menyentuh identitas kepegawaian", async () => {
    await masukPerangkat();
    const user = await profilMock.perbaruiKontak({
      phoneNumber: "0852-4000-9001",
      address: "Dusun Anabanua, Kec. Barru",
    });
    expect(user.fullName).toBe("Ahmad Fauzan");
    expect(user.email).toBe("ahmad@anabanua.id");
    expect(user.official.employeeId).toBe("19870412 201003 2 004");
    expect(user.official.position).toBe("Kaur Pemerintahan");
    expect(user.official.unit).toBe("Sekretariat Desa");
  });
});

describe("ganti kata sandi sendiri", () => {
  it("menolak kata sandi lama yang salah", async () => {
    await masukPerangkat();
    await expect(
      profilMock.ubahSandi({ sandiLama: "salah-sekali", sandiBaru: "anabanua2027" }),
    ).rejects.toThrow(/lama tidak cocok/i);
  });

  it("menolak kata sandi baru yang sama dengan yang lama", async () => {
    await masukPerangkat();
    await expect(
      profilMock.ubahSandi({ sandiLama: KATA_SANDI_DEMO, sandiBaru: KATA_SANDI_DEMO }),
    ).rejects.toThrow(/berbeda/i);
  });

  it("membuat sandi baru berlaku dan sandi lama mati", async () => {
    await masukPerangkat();
    await profilMock.ubahSandi({ sandiLama: KATA_SANDI_DEMO, sandiBaru: "anabanua2027" });

    await authMock.logout();
    await expect(
      authMock.login({ email: "ahmad@anabanua.id", password: KATA_SANDI_DEMO }),
    ).rejects.toThrow(/tidak cocok/i);
    expect(
      (await authMock.login({ email: "ahmad@anabanua.id", password: "anabanua2027" })).id,
    ).toBe("u-ahmad");
  });

  it("mencatat penggantian tanpa membocorkan sandi", async () => {
    await masukPerangkat();
    await profilMock.ubahSandi({ sandiLama: KATA_SANDI_DEMO, sandiBaru: "anabanua2027" });

    const log = muat().auditLogs[0];
    expect(log.action).toBe("MENGUBAH_KATA_SANDI");
    expect(log.detail).not.toContain("anabanua2027");
  });
});

describe("tanpa sesi", () => {
  it("tidak ada yang dapat diubah", async () => {
    await expect(
      profilMock.perbaruiKontak({ phoneNumber: "0852-4000-9001", address: "Dusun Anabanua" }),
    ).rejects.toThrow(/sesi/i);
    await expect(
      profilMock.ubahSandi({ sandiLama: KATA_SANDI_DEMO, sandiBaru: "anabanua2027" }),
    ).rejects.toThrow(/sesi/i);
  });
});
