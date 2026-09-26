/**
 * Waktu resmi kantor: WITA (Asia/Makassar).
 * Semua tampilan waktu memakai formatter ini agar konsisten dengan
 * server timestamp pada implementasi backend.
 */

export const ZONA_WAKTU = "Asia/Makassar";

const fmtTanggalPanjang = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA_WAKTU,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const fmtJam = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA_WAKTU,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtJamDetik = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA_WAKTU,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const fmtTanggalSingkat = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA_WAKTU,
  day: "2-digit",
  month: "short",
});

const fmtISODate = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_WAKTU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtHari = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_WAKTU,
  weekday: "short",
});

export function tanggalPanjang(d: Date | string): string {
  return fmtTanggalPanjang.format(new Date(d));
}

/** "07.41" gaya Indonesia. */
export function jam(d: Date | string): string {
  return fmtJam.format(new Date(d)).replace(":", ".");
}

/** "07.41.23" untuk readout instrumen. */
export function jamDetik(d: Date | string): string {
  return fmtJamDetik.format(new Date(d)).replace(/:/g, ".");
}

export function tanggalSingkat(d: Date | string): string {
  return fmtTanggalSingkat.format(new Date(d));
}

/** Bagian tanggal "YYYY-MM-DD" dalam WITA. */
export function tanggalISO(d: Date | string): string {
  return fmtISODate.format(new Date(d));
}

/** "07:41" dalam WITA — dipakai oleh usecase penilaian jadwal. */
export function jamISO(d: Date | string): string {
  return fmtJam.format(new Date(d)).replace(".", ":");
}

/** 0 = Minggu … 6 = Sabtu, dihitung dalam WITA. */
export function hariIndex(d: Date | string): number {
  const singkatan = fmtHari.format(new Date(d));
  const urutan = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return urutan.indexOf(singkatan);
}

/** Menit sejak tengah malam dari "HH:MM". */
export function menitDari(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "2 mnt lalu" / "3 jam lalu" untuk aktivitas terbaru. */
export function relatif(d: Date | string, kini: Date = new Date()): string {
  const selisih = Math.round((kini.getTime() - new Date(d).getTime()) / 60_000);
  if (selisih < 1) return "baru saja";
  if (selisih < 60) return `${selisih} mnt lalu`;
  const jamLalu = Math.floor(selisih / 60);
  if (jamLalu < 24) return `${jamLalu} jam lalu`;
  return tanggalSingkat(d);
}

/**
 * Format waktu ISO lengkap ke bentuk "24 Sep 2026, 14.05" — dipakai pada
 * timeline audit yang perlu mencetak tanggal + jam secara ringkas.
 */
const fmtWaktuWITA = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA_WAKTU,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatWaktuWITA(d: Date | string): string {
  return fmtWaktuWITA.format(new Date(d));
}

/** Jarak haversine dua koordinat dalam meter. */
export function jarakMeter(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
