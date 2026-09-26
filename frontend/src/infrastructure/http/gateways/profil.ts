import type {
  ChangePasswordCommand,
  ProfilGateway,
  UpdateContactCommand,
  User,
} from "@/core/ports/gateways";
import { api } from "@/infrastructure/http/client";

/**
 * Pintu data profil pemilik akun (backend: delivery/httpapi/profil_handler.go).
 * Keduanya POST karena klien HTTP hanya menyediakan get/post — sama seperti
 * endpoint lain di aplikasi ini.
 */
export const profilHttp: ProfilGateway = {
  /** POST /profil — telepon & alamat milik sesi yang sedang aktif. */
  perbaruiKontak(command: UpdateContactCommand): Promise<User> {
    return api.post<User>("/profil", command);
  },

  /** POST /profil/sandi — sandi lama diperiksa server; balasan 204 tanpa isi. */
  ubahSandi(command: ChangePasswordCommand): Promise<void> {
    return api.post<void>("/profil/sandi", command);
  },
};
