import type {
  ActivateAccountCommand,
  AuthGateway,
  LoginCommand,
  User,
} from "@/core/ports/gateways";
import {
  normalkanKode,
  pesanKodeTidakSah,
  undanganSah,
} from "@/core/domain/undangan";
import { validasiAktivasiAkun } from "@/core/usecase/akun";
import { muat, simpan } from "@/infrastructure/mock/store";
import { catatAudit, keUser } from "@/infrastructure/mock/helpers";

export const authMock: AuthGateway = {
  async login({ email, password }: LoginCommand): Promise<User> {
    const db = muat();
    const user = db.users.find(
      (u) => u.email === email.trim().toLowerCase(),
    );
    if (!user) {
      throw new Error("Email atau kata sandi tidak cocok.");
    }

    /*
     * Status akun diperiksa sebelum kata sandi supaya pesannya benar-benar
     * menolong: akun yang belum diaktivasi belum punya kata sandi sama sekali,
     * jadi "kata sandi salah" justru menyesatkan pengguna. Konsekuensinya
     * keberadaan sebuah akun terbaca dari pesan ini — dapat diterima untuk
     * sistem internal desa; backend tetap wajib membatasi laju endpoint masuk.
     */
    if (user.accountStatus === "UNDANGAN") {
      throw new Error(
        "Akun belum diaktivasi. Buka halaman Aktivasi akun dengan kode undangan dari sekretaris desa.",
      );
    }
    if (user.accountStatus === "NONAKTIF") {
      throw new Error("Akun dinonaktifkan. Hubungi sekretaris desa.");
    }
    if (!user.password || user.password !== password) {
      throw new Error("Email atau kata sandi tidak cocok.");
    }

    db.sessionUserId = user.id;
    catatAudit(user, "MASUK", "Session", user.id, "Login berhasil.");
    simpan();
    return keUser(user);
  },

  async logout() {
    const db = muat();
    db.sessionUserId = null;
    simpan();
  },

  async getCurrentUser() {
    const db = muat();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    return user ? keUser(user) : null;
  },

  async getUndangan(kode: string) {
    const db = muat();
    const undangan = db.undangan.find((u) => u.kode === normalkanKode(kode));
    return undangan ? { ...undangan } : null;
  },

  async aktifkan(kode: string, command: ActivateAccountCommand): Promise<User> {
    const db = muat();
    const undangan = db.undangan.find((u) => u.kode === normalkanKode(kode));
    const pesan = pesanKodeTidakSah(undangan);
    if (pesan) throw new Error(pesan);
    // Penjagaan ulang agar tipe undangan menyempit setelah pemeriksaan pesan.
    if (!undangan || !undanganSah(undangan)) {
      throw new Error("Kode aktivasi tidak dapat dipakai.");
    }

    const user = db.users.find((u) => u.id === undangan.userId);
    if (!user) throw new Error("Akun untuk kode aktivasi ini tidak ditemukan.");

    // Konfirmasi kata sandi hanya urusan formulir; di sini nilainya sama.
    const periksa = validasiAktivasiAkun({ ...command, konfirmasi: command.password });
    if (!periksa.sah) throw new Error(periksa.galat[0]);

    const kini = new Date().toISOString();
    user.password = command.password;
    user.official = {
      ...user.official,
      phoneNumber: command.phoneNumber.trim(),
      address: command.address.trim(),
    };
    user.accountStatus = "AKTIF";
    // Persetujuan dicatat waktunya — dasar sah pemrosesan data wajah (§19).
    user.biometricConsentAt = kini;
    db.undangan = db.undangan.map((u) =>
      u.kode === undangan.kode ? { ...u, dipakaiPada: kini } : u,
    );
    // Kode undangan langsung membuka sesi agar dapat lanjut ke pendaftaran wajah.
    db.sessionUserId = user.id;

    catatAudit(
      user,
      "MENGAKTIFKAN_AKUN",
      "User",
      user.id,
      "Akun diaktivasi lewat kode undangan; data mandiri dilengkapi dan persetujuan pemrosesan data wajah dicatat.",
    );
    simpan();
    return keUser(user);
  },
};
