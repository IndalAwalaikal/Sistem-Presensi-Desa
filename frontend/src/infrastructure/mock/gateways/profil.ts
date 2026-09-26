import type {
  ChangePasswordCommand,
  ProfilGateway,
  UpdateContactCommand,
  User,
} from "@/core/ports/gateways";
import { validasiKontak, validasiUbahSandi } from "@/core/usecase/profil";
import { catatAudit, keUser, penggunaSession } from "@/infrastructure/mock/helpers";
import { simpan } from "@/infrastructure/mock/store";

/**
 * Profil pemilik akun pada data contoh — paralel dengan usecase backend.
 * Nama, email, NIP/NIK, jabatan, dan unit tidak punya jalur tulis di sini;
 * hanya kontak dan kata sandi yang boleh diurus pemiliknya sendiri.
 */
export const profilMock: ProfilGateway = {
  async perbaruiKontak(command: UpdateContactCommand): Promise<User> {
    const aktor = penggunaSession();
    const periksa = validasiKontak(command);
    if (!periksa.sah) throw new Error(periksa.galat[0]);

    const telepon = command.phoneNumber.trim();
    const alamat = command.address.trim();
    if (telepon === aktor.official.phoneNumber && alamat === aktor.official.address) {
      return keUser(aktor);
    }

    aktor.official = { ...aktor.official, phoneNumber: telepon, address: alamat };
    catatAudit(
      aktor,
      "MEMPERBARUI_KONTAK",
      "User",
      aktor.id,
      "Nomor telepon dan alamat diperbarui sendiri oleh pemilik akun.",
    );
    simpan();
    return keUser(aktor);
  },

  async ubahSandi(command: ChangePasswordCommand): Promise<void> {
    const aktor = penggunaSession();

    // Konfirmasi ulang hanya urusan formulir; di sini nilainya sama.
    const periksa = validasiUbahSandi({ ...command, konfirmasi: command.sandiBaru });
    if (!periksa.sah) throw new Error(periksa.galat[0]);
    if (aktor.password !== command.sandiLama) {
      throw new Error("Kata sandi lama tidak cocok.");
    }
    if (aktor.password === command.sandiBaru) {
      throw new Error("Kata sandi baru harus berbeda dari kata sandi lama.");
    }

    aktor.password = command.sandiBaru;
    catatAudit(
      aktor,
      "MENGUBAH_KATA_SANDI",
      "User",
      aktor.id,
      "Pemilik akun mengganti kata sandinya sendiri.",
    );
    simpan();
  },
};
