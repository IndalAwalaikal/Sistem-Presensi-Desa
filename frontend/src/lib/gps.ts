export interface Lokasi {
  latitude: number;
  longitude: number;
  /** Akurasi GPS perangkat dalam meter. */
  accuracyMeters: number;
}

/**
 * Ambil posisi perangkat dari browser GPS.
 * Gagal bila izin ditolak, sinyal buruk, atau melewati batas waktu.
 */
export function ambilLokasi(batasDetik = 12): Promise<Lokasi> {
  return new Promise((resolve, tolak) => {
    if (!("geolocation" in navigator)) {
      tolak(new Error("Perangkat tidak mendukung GPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy ?? 999,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          tolak(new Error("Izin lokasi ditolak. Presensi memerlukan GPS aktif."));
        } else if (err.code === err.TIMEOUT) {
          tolak(new Error("GPS lambat merespons. Cari tempat terbuka lalu ulangi."));
        } else {
          tolak(new Error("Lokasi tidak tersedia. Periksa sinyal Anda."));
        }
      },
      { enableHighAccuracy: true, timeout: batasDetik * 1000, maximumAge: 5_000 },
    );
  });
}
