/**
 * Entitas presensi: lokasi kantor, jadwal kerja, dan transaksi presensi.
 * Murni TypeScript — tanpa dependensi framework (lapisan domain).
 */

// ---------------------------------------------------------------------------
// Lokasi kantor & geofence
// ---------------------------------------------------------------------------

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface OfficeLocation {
  readonly id: string;
  readonly name: string;
  readonly point: GeoPoint;
  /** Radius geofence dalam meter. */
  readonly radiusMeters: number;
}

/** Jarak haversine antara dua titik (meter). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export type GeofenceVerdict = "INSIDE" | "OUTSIDE" | "INACCURATE";

export interface GeofenceCheck {
  readonly verdict: GeofenceVerdict;
  readonly distanceMeters: number;
  /** Akurasi GPS perangkat dalam meter. */
  readonly accuracyMeters: number;
}

export function evaluateGeofence(
  userPoint: GeoPoint,
  accuracyMeters: number,
  office: OfficeLocation,
  maxAccuracyMeters: number,
): GeofenceCheck {
  const distance = distanceMeters(userPoint, office.point);
  if (accuracyMeters > maxAccuracyMeters) {
    return { verdict: "INACCURATE", distanceMeters: distance, accuracyMeters };
  }
  const verdict: GeofenceVerdict = distance <= office.radiusMeters ? "INSIDE" : "OUTSIDE";
  return { verdict, distanceMeters: distance, accuracyMeters };
}

// ---------------------------------------------------------------------------
// Jadwal kerja
// ---------------------------------------------------------------------------

export interface WorkSchedule {
  readonly id: string;
  readonly name: string;
  /**
   * Jam masuk — awal jendela presensi datang, mis. "07:30". Presensi datang
   * sebelum jam ini tetap dihitung tepat waktu (datang lebih awal).
   */
  readonly checkInStart: string;
  /**
   * Batas masuk — presensi datang pada jam ini masih **tepat waktu**; satu menit
   * setelahnya tercatat **terlambat**, mis. "08:00".
   */
  readonly checkInDeadline: string;
  /**
   * Jam pulang — presensi pulang sebelum jam ini tercatat **pulang cepat**,
   * mis. "16:00".
   */
  readonly checkOutStart: string;
  /**
   * Batas pulang — presensi pulang setelah jam ini tercatat **lebih dari jam
   * kerja**, mis. "17:00". Di antara jam pulang dan batas pulang: tepat waktu.
   */
  readonly checkOutEnd: string;
  /** 0 = Minggu … 6 = Sabtu. */
  readonly workDays: readonly number[];
}

/** Jadwal khusus: jam kerja khusus rentang tanggal tertentu (mis. Ramadan, masa cuti bersama). */
export interface JadwalKhusus {
  readonly id: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly checkInStart: string;
  readonly checkInDeadline: string;
  readonly checkOutStart: string;
  readonly checkOutEnd: string;
  readonly workDays: readonly number[];
  readonly createdBy?: string;
  readonly createdAt?: string;
}

export interface CreateJadwalKhususCommand {
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly checkInStart: string;
  readonly checkInDeadline: string;
  readonly checkOutStart: string;
  readonly checkOutEnd: string;
  readonly workDays: readonly number[];
}

export function isWorkDay(schedule: WorkSchedule, date: Date): boolean {
  return schedule.workDays.includes(date.getDay());
}

/** Nama hari, 0 = Minggu … 6 = Sabtu — dipakai saat menetapkan hari kerja. */
export const HARI_LABEL: Record<number, string> = {
  0: "Minggu",
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
};

/**
 * Urutan tampil hari kerja: Senin lebih dulu, Minggu di akhir — sama dengan
 * kebiasaan menulis hari kerja kantor desa ("Senin–Sabtu"), bukan urutan
 * bawaan JavaScript (Minggu di awal).
 */
export const URUTAN_HARI = [1, 2, 3, 4, 5, 6, 0] as const;

// ---------------------------------------------------------------------------
// Transaksi presensi
// ---------------------------------------------------------------------------

export const ATTENDANCE_TYPES = ["CHECK_IN", "CHECK_OUT"] as const;
export type AttendanceType = (typeof ATTENDANCE_TYPES)[number];

export const ATTENDANCE_MODES = ["WFO", "WFH", "DINAS_LUAR"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const ATTENDANCE_MODE_LABEL: Record<AttendanceMode, string> = {
  WFO: "WFO",
  WFH: "WFH",
  DINAS_LUAR: "Dinas Luar",
};

export const ATTENDANCE_STATUSES = [
  "TEPAT_WAKTU",
  "TERLAMBAT",
  "PULANG_CEPAT",
  "LEBIH_KERJA",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_TYPE_LABEL: Record<AttendanceType, string> = {
  CHECK_IN: "Masuk",
  CHECK_OUT: "Pulang",
};

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  TEPAT_WAKTU: "Tepat Waktu",
  TERLAMBAT: "Terlambat",
  PULANG_CEPAT: "Pulang Cepat",
  LEBIH_KERJA: "Lebih dari Jam Kerja",
};

/** Metadata hasil verifikasi berlapis yang disimpan bersama transaksi. */
export interface VerificationMeta {
  readonly faceMatch: boolean;
  /** Cosine similarity mentah (-1..1), bukan persentase/probabilitas. */
  readonly faceScore: number;
  readonly liveness: boolean;
  readonly livenessScore: number;
  readonly geofence: GeofenceCheck;
  /** Waktu resmi dari server (ISO string). */
  readonly serverTime: string;
}

export interface Attendance {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly type: AttendanceType;
  readonly mode: AttendanceMode;
  readonly status: AttendanceStatus;
  /**
   * Selisih menit thd ambang jadwal SAAT transaksi dicatat (positif = setelah
   * ambang, negatif = sebelum ambang, 0 = tepat). Backend menyimpannya sejak
   * presensi dikirim supaya rekap tetap konsisten walau jadwal berubah tengah
   * bulan. Opsional: data lama/mock yang belum menyimpannya memakai hitung
   * ulang dari jadwal aktif sebagai fallback.
   */
  readonly selisihMenit?: number;
  readonly office: Pick<OfficeLocation, "id" | "name">;
  readonly verification: VerificationMeta;
}

/**
 * Status saat ini dari hari kerja seorang pengguna.
 *
 * `modeSaran` hanya muncul pada BELUM_PRESENSI: pengajuan WFH/dinas luar yang
 * disetujui TIDAK mengunci pintu presensi (itu kind `IZIN`, yang khusus untuk
 * izin/sakit/cuti), tetapi menentukan mode yang sah dan membebaskan radius
 * kantor. Tanpa ini perangkat yang WFH tidak pernah bisa presensi, lalu divonis
 * tanpa keterangan di rekap bulanan.
 */
export type TodayStatus =
  | { kind: "BELUM_PRESENSI"; modeSaran?: AttendanceMode }
  | { kind: "SUDAH_CHECKIN"; attendance: Attendance }
  | { kind: "SELESAI"; checkIn: Attendance; checkOut: Attendance }
  | { kind: "IZIN"; label: string };

/**
 * Mode yang hanya sah bila ada pengajuan disetujui yang mencakup hari itu —
 * paralel `AttendanceMode.WajibPengajuan()` di backend. Modenya dikirim klien,
 * jadi tanpa aturan ini siapa pun dapat lolos radius kantor dengan menulis mode
 * WFH.
 */
export function modeWajibPengajuan(mode: AttendanceMode): boolean {
  return mode === "WFH" || mode === "DINAS_LUAR";
}

export interface AttendanceFilters {
  readonly from?: string;
  readonly to?: string;
  readonly userId?: string;
  readonly status?: AttendanceStatus;
}

/**
 * Baris presensi untuk daftar & monitoring (dipakai pengelola akun pada
 * GET /api/admin/presensi) — satu baris per transaksi presensi.
 */
export interface AttendanceListItem {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly position: string;
  readonly type: AttendanceType;
  readonly mode: AttendanceMode;
  readonly status: AttendanceStatus;
  /** ISO datetime server. */
  readonly at: string;
  /**
   * Selisih menit thd ambang jadwal SAAT transaksi dicatat — paralel
   * `Attendance.selisihMenit`. Monitoring memakainya untuk kalimat & total
   * durasi supaya konsisten walau jadwal berubah tengah hari.
   */
  readonly selisihMenit: number;
  readonly distanceMeters: number;
}
