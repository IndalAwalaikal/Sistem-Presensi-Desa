import type {
  HasilImporLibur,
  LiburGateway,
  SimpanLiburCommand,
} from "@/core/ports/gateways";
import type { HariLibur } from "@/core/domain/libur";
import { api } from "@/infrastructure/http/client";

export const liburHttp: LiburGateway = {
  /** GET /api/libur?tahun= — hari libur satu tahun; tanpa tahun = tahun berjalan. */
  tahun(tahun?: number): Promise<HariLibur[]> {
    return api.get<HariLibur[]>("/libur", {
      tahun: tahun === undefined ? undefined : String(tahun),
    });
  },

  /** POST /api/admin/libur — tambah/ubah satu tanggal (libur lokal desa). */
  simpan(command: SimpanLiburCommand): Promise<HariLibur> {
    return api.post<HariLibur>("/admin/libur", command);
  },

  /** POST /api/admin/libur/{tanggal}/hapus — buang satu tanggal libur. */
  hapus(tanggal: string): Promise<void> {
    return api.post<void>(`/admin/libur/${encodeURIComponent(tanggal)}/hapus`);
  },

  /** POST /api/admin/libur/impor — tarik kalender resmi dari sumber di env. */
  impor(tahun: number): Promise<HasilImporLibur> {
    return api.post<HasilImporLibur>("/admin/libur/impor", { tahun });
  },
};
