import type {
  ActivateAccountCommand,
  AuthGateway,
  LoginCommand,
  User,
} from "@/core/ports/gateways";
import type { Undangan } from "@/core/domain/undangan";
import { api } from "@/infrastructure/http/client";

interface ResponsLogin {
  pengguna: User;
}

export const authHttp: AuthGateway = {
  async login({ email, password }: LoginCommand): Promise<User> {
    const hasil = await api.post<ResponsLogin>("/auth/login", { email, password });
    return hasil.pengguna;
  },

  async logout(): Promise<void> {
    await api.post<void>("/auth/logout");
  },

  getCurrentUser(): Promise<User | null> {
    return api.get<User | null>("/auth/saya");
  },

  /** Endpoint publik: rincian undangan dari kode (untuk halaman aktivasi). */
  getUndangan(kode: string): Promise<Undangan | null> {
    return api.get<Undangan | null>(`/aktivasi/${encodeURIComponent(kode)}`);
  },

  /**
   * Endpoint publik: aktivasi akun. Sama seperti login, backend mengembalikan
   * respons pengguna; backend menetapkan cookie sesi HttpOnly agar pengguna
   * dapat langsung melanjutkan ke pendaftaran wajah.
   */
  async aktifkan(kode: string, command: ActivateAccountCommand): Promise<User> {
    const hasil = await api.post<ResponsLogin>(
      `/aktivasi/${encodeURIComponent(kode)}`,
      command,
    );
    return hasil.pengguna;
  },
};
