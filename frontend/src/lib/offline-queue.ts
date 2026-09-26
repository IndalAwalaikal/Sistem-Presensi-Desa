/**
 * Antrean Presensi Offline (IndexedDB).
 * Menyimpan presensi lokal saat jaringan seluler/desa terputus dan
 * melakukan replay / pengiriman otomatis saat koneksi internet kembali pulih.
 */

import type {
  AttendanceMode,
  AttendanceType,
  PresensiResult,
} from "@/core/ports/gateways";
import type { AppGateways } from "@/core/ports/gateways";

export interface ItemAntreanPresensi {
  id: string;
  userId: string;
  userName: string;
  type: AttendanceType;
  mode: AttendanceMode;
  faceScore: number;
  livenessScore: number;
  location: { latitude: number; longitude: number };
  accuracyMeters: number;
  frameDataUrl?: string;
  waktuPencatatan: string; // ISO time saat difoto offline
  status: "TERTUNDA" | "MENYINKRONKAN" | "GAGAL";
  retryCount: number;
  pesanGalat?: string;
}

const NAMA_DB = "PresensiAnabanuaOfflineDB";
const VERSI_DB = 1;
const NAMA_STORE = "antrean_presensi";

function bukaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB tidak didukung pada browser ini."));
      return;
    }
    const request = indexedDB.open(NAMA_DB, VERSI_DB);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(NAMA_STORE)) {
        db.createObjectStore(NAMA_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Simpan satu rekaman presensi ke antrean offline lokal browser */
export async function tambahAntreanPresensi(
  data: Omit<ItemAntreanPresensi, "id" | "status" | "retryCount">,
): Promise<ItemAntreanPresensi> {
  const db = await bukaDB();
  const id = `antre-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ItemAntreanPresensi = {
    ...data,
    id,
    status: "TERTUNDA",
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(NAMA_STORE, "readwrite");
    const store = tx.objectStore(NAMA_STORE);
    const req = store.put(item);

    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

/** Ambil seluruh antrean presensi yang tersimpan di IndexedDB */
export async function ambilSemuaAntrean(): Promise<ItemAntreanPresensi[]> {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NAMA_STORE, "readonly");
    const store = tx.objectStore(NAMA_STORE);
    const req = store.getAll();

    req.onsuccess = () => resolve((req.result as ItemAntreanPresensi[]) || []);
    req.onerror = () => reject(req.error);
  });
}

/** Hapus item antrean setelah berhasil dikirim atau dibatalkan */
export async function hapusAntrean(id: string): Promise<void> {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NAMA_STORE, "readwrite");
    const store = tx.objectStore(NAMA_STORE);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Perbarui item status di antrean */
async function perbaruiItem(item: ItemAntreanPresensi): Promise<void> {
  const db = await bukaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NAMA_STORE, "readwrite");
    const store = tx.objectStore(NAMA_STORE);
    const req = store.put(item);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Sinkronkan seluruh antrean presensi tertunda ke backend.
 * Dipanggil otomatis saat koneksi 'online' pulih atau manual oleh pengguna.
 */
export async function sinkronkanAntrean(
  gateways: AppGateways,
): Promise<{ berhasil: number; gagal: number; rincian: string[] }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      berhasil: 0,
      gagal: 0,
      rincian: ["Perangkat masih dalam keadaan offline / tanpa sambungan internet."],
    };
  }

  const daftar = await ambilSemuaAntrean();
  const tertunda = daftar.filter((d) => d.status !== "MENYINKRONKAN");

  let berhasil = 0;
  let gagal = 0;
  const rincian: string[] = [];

  for (const item of tertunda) {
    item.status = "MENYINKRONKAN";
    await perbaruiItem(item);

    try {
      const hasil: PresensiResult = await gateways.attendance.submitPresensi({
        type: item.type,
        mode: item.mode,
        faceScore: item.faceScore,
        livenessScore: item.livenessScore,
        location: item.location,
        accuracyMeters: item.accuracyMeters,
        frameDataUrl: item.frameDataUrl,
      });

      if (hasil.accepted) {
        await hapusAntrean(item.id);
        berhasil++;
        rincian.push(
          `Presensi ${item.type === "CHECK_IN" ? "Masuk" : "Pulang"} an. ${item.userName} berhasil disinkronkan.`,
        );
      } else {
        item.status = "GAGAL";
        item.retryCount += 1;
        item.pesanGalat = hasil.rejection?.message ?? "Ditolak oleh server.";
        await perbaruiItem(item);
        gagal++;
        rincian.push(
          `Presensi an. ${item.userName} gagal: ${item.pesanGalat}`,
        );
      }
    } catch (err) {
      item.status = "GAGAL";
      item.retryCount += 1;
      item.pesanGalat = err instanceof Error ? err.message : "Gagal terhubung ke server.";
      await perbaruiItem(item);
      gagal++;
      rincian.push(`Galat jaringan: ${item.pesanGalat}`);
    }
  }

  return { berhasil, gagal, rincian };
}
