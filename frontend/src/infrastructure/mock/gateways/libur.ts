import type {
  HasilImporLibur,
  LiburGateway,
  SimpanLiburCommand,
} from "@/core/ports/gateways";
import type { HariLibur } from "@/core/domain/libur";
import { bolehKelolaJadwal } from "@/core/domain/user";
import { rapikanLibur, validasiLibur } from "@/core/usecase/libur";
import { SEED_HARI_LIBUR } from "@/infrastructure/mock/seed-libur";
import { catatAudit, penggunaSession } from "@/infrastructure/mock/helpers";
import { muat, simpan } from "@/infrastructure/mock/store";

function urut(hari: readonly HariLibur[]): HariLibur[] {
  return [...hari].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

function padaTahun(tanggal: string, tahun: number): boolean {
  return tanggal.startsWith(`${tahun}-`);
}

/** Kalender libur pada mode contoh — paralel dengan `usecase.LiburUsecase`. */
export const liburMock: LiburGateway = {
  async tahun(tahun?: number): Promise<HariLibur[]> {
    const db = muat();
    const t = tahun ?? new Date().getFullYear();
    return urut(db.hariLibur.filter((h) => padaTahun(h.tanggal, t))).map((h) => ({ ...h }));
  },

  async simpan(command: SimpanLiburCommand): Promise<HariLibur> {
    const aktor = penggunaSession();
    if (!bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat menetapkan kalender hari libur.",
      );
    }
    const periksa = validasiLibur(command);
    if (!periksa.sah) throw new Error(periksa.galat[0]);

    const bersih = rapikanLibur(command);
    const db = muat();
    const idx = db.hariLibur.findIndex((h) => h.tanggal === bersih.tanggal);
    const sebelum: HariLibur | undefined = idx === -1 ? undefined : db.hariLibur[idx];
    // Sumber selalu MANUAL: catatan yang ditetapkan pengelola akun tidak boleh
    // ditimpa penarikan kalender resmi berikutnya.
    const sesudah: HariLibur = {
      tanggal: bersih.tanggal,
      nama: bersih.nama,
      jenis: bersih.jenis ?? sebelum?.jenis ?? "LIBUR_LOKAL",
      sumber: "MANUAL",
    };
    if (idx === -1) db.hariLibur.push(sesudah);
    else db.hariLibur[idx] = sesudah;

    catatAudit(
      aktor,
      sebelum ? "MENGUBAH_HARI_LIBUR" : "MENAMBAH_HARI_LIBUR",
      "HariLibur",
      sesudah.tanggal,
      sebelum
        ? `Hari libur diubah: ${sebelum.tanggal} — ${sebelum.nama} (${sebelum.jenis}) → ${sesudah.tanggal} — ${sesudah.nama} (${sesudah.jenis}).`
        : `Hari libur ditambahkan: ${sesudah.tanggal} — ${sesudah.nama} (${sesudah.jenis}).`,
    );
    simpan();
    return { ...sesudah };
  },

  async hapus(tanggal: string): Promise<void> {
    const aktor = penggunaSession();
    if (!bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat mengubah kalender hari libur.",
      );
    }
    const db = muat();
    const idx = db.hariLibur.findIndex((h) => h.tanggal === tanggal);
    if (idx === -1) throw new Error("Tanggal itu bukan hari libur.");
    const [lama] = db.hariLibur.splice(idx, 1);
    catatAudit(
      aktor,
      "MENGHAPUS_HARI_LIBUR",
      "HariLibur",
      tanggal,
      `Hari libur dihapus: ${lama.tanggal} — ${lama.nama} (${lama.jenis}).`,
    );
    simpan();
  },

  async impor(tahun: number): Promise<HasilImporLibur> {
    const aktor = penggunaSession();
    if (!bolehKelolaJadwal(aktor.role)) {
      throw new Error(
        "Hanya sekretaris atau kepala desa yang dapat menarik kalender resmi.",
      );
    }
    const db = muat();
    const bawaan = SEED_HARI_LIBUR.filter((h) => padaTahun(h.tanggal, tahun) && h.sumber === "SKB");
    if (bawaan.length === 0) {
      throw new Error("Belum ada daftar bawaan untuk tahun itu.");
    }

    let baru = 0;
    let diubah = 0;
    let diabaikan = 0;
    for (const h of bawaan) {
      const idx = db.hariLibur.findIndex((x) => x.tanggal === h.tanggal);
      if (idx === -1) {
        db.hariLibur.push({ ...h, sumber: "IMPOR" });
        baru += 1;
        continue;
      }
      const ada = db.hariLibur[idx];
      if (ada.sumber === "MANUAL") {
        diabaikan += 1; // keputusan pengelola akun dipertahankan
        continue;
      }
      if (ada.nama === h.nama && ada.jenis === h.jenis) continue;
      db.hariLibur[idx] = { ...h, sumber: "IMPOR" };
      diubah += 1;
    }

    catatAudit(
      aktor,
      "MENGIMPOR_HARI_LIBUR",
      "HariLibur",
      String(tahun),
      `Kalender resmi ${tahun} ditarik: ${baru} baru, ${diubah} diperbarui, ${diabaikan} catatan manual dipertahankan.`,
    );
    simpan();
    return {
      tahun,
      baru,
      diubah,
      diabaikan,
      hari: urut(db.hariLibur.filter((h) => padaTahun(h.tanggal, tahun))).map((h) => ({ ...h })),
    };
  },
};
