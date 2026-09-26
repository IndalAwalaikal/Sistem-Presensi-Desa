/**
 * Aturan status presensi berdasarkan jadwal — paralel dengan aturan backend.
 * Fungsi murni; waktu yang dipakai selalu waktu server.
 */

import type {
  Attendance,
  AttendanceListItem,
  AttendanceStatus,
  AttendanceType,
  VerificationMeta,
  WorkSchedule,
} from "@/core/domain/attendance";
import { jamISO, menitDari } from "@/lib/waktu";

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Ambang jadwal yang menentukan "lambat berapa menit" dan "cepat berapa menit". */
export type AmbangJadwal = Pick<
  WorkSchedule,
  "checkInDeadline" | "checkOutStart" | "checkOutEnd"
>;

/** Bagian transaksi pribadi yang cukup untuk menghitung selisih terhadap jadwal. */
export type TransaksiWaktu = Pick<Attendance, "type" | "status" | "selisihMenit"> & {
  verification: Pick<VerificationMeta, "serverTime">;
};

/** Baris presensi admin (GET /api/admin/presensi): memakai `at`, bukan `verification`. */
export type TransaksiBarisAdmin = Pick<
  AttendanceListItem,
  "type" | "status" | "at" | "selisihMenit"
>;

export interface ScheduleEvaluation {
  readonly status: AttendanceStatus;
  /** Selisih dalam menit relatif terhadap ambang jadwal. */
  readonly deltaMinutes: number;
}

/**
 * Selisih presensi relatif terhadap ambang jadwal — paralel dengan
 * `domain.EvaluasiJadwal` pada backend: satu-satunya kejujuran adalah waktu
 * server (`serverTime`) dibanding ambang jadwal yang berlaku.
 *
 * Data transaksi (Attendance / AttendanceListItem) hanya membawa jam dan
 * status; jadwal aktif dibaca terpisah dari GET /api/konfigurasi. Karena itu
 * semua pembantu di sini menerima jadwal sebagai argumen eksplisit — tidak
 * ada jadwal yang ditanam di dalam kode.
 */

/**
 * Inti hitung selisih dari jam dinding (WITA) — dipakai baik oleh transaksi
 * pribadi (Attendance) maupun baris monitoring admin (AttendanceListItem).
 */
export function selisihMenitDariJam(
  type: AttendanceType,
  status: AttendanceStatus,
  serverTimeISO: string | Date,
  jadwal: AmbangJadwal | null,
): number | null {
  if (!jadwal) return null;
  const kini = menitDari(jamISO(serverTimeISO));
  if (type === "CHECK_IN") {
    if (status !== "TERLAMBAT") return 0;
    return kini - menitDari(jadwal.checkInDeadline);
  }
  if (status === "PULANG_CEPAT") {
    return kini - menitDari(jadwal.checkOutStart);
  }
  if (status === "LEBIH_KERJA") {
    return kini - menitDari(jadwal.checkOutEnd);
  }
  return 0;
}

/**
 * Selisih dalam menit relatif terhadap ambang jadwal, dari satu transaksi.
 * Selisih yang TERSIMPAN saat presensi (`selisihMenit`) dipakai apa adanya —
 * itulah angka yang dinilai terhadap jadwal saat transaksi dicatat. Hitung
 * ulang dari jadwal aktif hanya fallback untuk baris lama yang belum
 * menyimpannya (0/undefined).
 */
export function selisihMenitTransaksi(
  a: TransaksiWaktu,
  jadwal: AmbangJadwal | null,
): number | null {
  if (a.selisihMenit !== undefined && a.selisihMenit !== 0) return a.selisihMenit;
  return selisihMenitDariJam(a.type, a.status, a.verification.serverTime, jadwal);
}

/**
 * Selisih dalam menit relatif terhadap ambang jadwal, dari satu baris admin.
 * Selisih tersimpan (`selisihMenit`, dinilai saat transaksi dicatat) dipakai
 * apa adanya; hitung ulang dari jadwal aktif hanya fallback baris lama.
 */
export function selisihMenitBarisAdmin(
  a: TransaksiBarisAdmin,
  jadwal: AmbangJadwal | null,
): number | null {
  if (a.selisihMenit !== undefined && a.selisihMenit !== 0) return a.selisihMenit;
  return selisihMenitDariJam(a.type, a.status, a.at, jadwal);
}

/**
 * Kalimat dari selisih yang sudah dihitung — satu tempat untuk susunan
 * kalimatnya ("terlambat 25 mnt dari batas masuk 08:00"), supaya transaksi
 * pribadi dan baris monitoring admin menyebut hal yang sama dengan cara sama.
 */
function kalimatDariSelisih(
  type: AttendanceType,
  status: AttendanceStatus,
  selisih: number,
  jadwal: AmbangJadwal,
): string | null {
  if (type === "CHECK_IN") {
    return `terlambat ${formatSelisihMenit(selisih)} dari batas masuk ${jadwal.checkInDeadline}`;
  }
  if (status === "PULANG_CEPAT") {
    return `pulang cepat ${formatSelisihMenit(selisih)} dari jam pulang ${jadwal.checkOutStart}`;
  }
  if (status === "LEBIH_KERJA") {
    return `lebih kerja ${formatSelisihMenit(selisih)} dari batas pulang ${jadwal.checkOutEnd}`;
  }
  return null;
}

/**
 * Kalimat selisih lengkap untuk satu transaksi — jawaban "lambat berapa menit /
 * berapa jam" dan "pulang cepat berapa menit/jam":
 *
 *   "terlambat 25 mnt dari batas masuk 08:00",
 *   "pulang cepat 1 jam 10 mnt dari jam pulang 16:00".
 *
 * Kembalikan null bila transaksi tepat waktu (tidak ada yang perlu disebut) atau
 * bila jadwal belum dimuat — tanpa jadwal tidak ada ambang yang bisa dibandingkan.
 */
export function kalimatSelisihTransaksi(
  a: TransaksiWaktu,
  jadwal: AmbangJadwal | null,
): string | null {
  const selisih = selisihMenitTransaksi(a, jadwal);
  if (!jadwal || selisih === null || selisih === 0) return null;
  return kalimatDariSelisih(a.type, a.status, selisih, jadwal);
}

/**
 * Kalimat selisih untuk baris monitoring admin ("terlambat 25 mnt dari batas
 * masuk 08:00"). Bentuk datanya memakai `at`, bukan `verification.serverTime`.
 * Selisih tersimpan (`selisihMenit`, dinilai terhadap jadwal saat transaksi
 * dicatat) dipakai apa adanya supaya konsisten walau jadwal berubah; hitung
 * ulang hanya berlaku sebagai fallback untuk baris lama.
 */
export function kalimatSelisihBarisAdmin(
  a: TransaksiBarisAdmin,
  jadwal: AmbangJadwal | null,
): string | null {
  const selisih = selisihMenitBarisAdmin(a, jadwal);
  if (!jadwal || selisih === null || selisih === 0) return null;
  return kalimatDariSelisih(a.type, a.status, selisih, jadwal);
}

/**
 * Total menit untuk satu status dalam sebulan — dipakai meringkas "berapa
 * lama" di balik angka "berapa kali" (mis. 3 kali terlambat = 45 mnt).
 * Hanya transaksi yang selisihnya searah status yang dijumlahkan.
 */
export function formatSelisihMenit(deltaMinutes: number): string {
  const total = Math.round(Math.abs(deltaMinutes));
  if (total < 1) return "tepat pada jadwal";
  if (total < 60) return `${total} mnt`;
  const jam = Math.floor(total / 60);
  const sisa = total % 60;
  return sisa === 0 ? `${jam} jam` : `${jam} jam ${sisa} mnt`;
}

/**
 * Ringkasan satu angka sebulan: jumlah kejadian + total durasi.
 * Contoh: (3 kali, 95 menit) → "3 kali · total 1 jam 35 mnt".
 * Dipakai di riwayat ("Hadir terlambat — 3 hari · total …") dan laporan.
 */
export function ringkasSelisih(
  jumlah: number,
  totalMenit: number,
): string | null {
  if (jumlah <= 0) return null;
  if (totalMenit <= 0) return null;
  return `total ${formatSelisihMenit(totalMenit)}`;
}

/**
 * Agregat selisih dari sekumpulan transaksi — satu bulan penuh di riwayat, atau
 * satu hari saja di monitoring. Kembalikan total menit keterlambatan
 * (CHECK_IN/TERLAMBAT), total menit pulang lebih awal (CHECK_OUT/PULANG_CEPAT),
 * dan total menit lebih kerja (CHECK_OUT/LEBIH_KERJA).
 */
export interface RingkasanSelisih {
  readonly terlambatMenit: number;
  readonly pulangCepatMenit: number;
  readonly lebihKerjaMenit: number;
}

/** Satu transaksi yang sudah diseragamkan agar dapat dijumlahkan seragam. */
interface BarisSelisih {
  readonly type: AttendanceType;
  readonly status: AttendanceStatus;
  readonly waktu: string | Date;
  /** Selisih yang dicatat saat presensi (bila ada); 0/undefined = hitung ulang. */
  readonly tersimpan?: number;
}

/** Inti penjumlahan — satu-satunya tempat aturan "selisih mana yang dihitung". */
function jumlahkanSelisih(
  baris: readonly BarisSelisih[],
  jadwal: AmbangJadwal | null,
): RingkasanSelisih {
  let terlambatMenit = 0;
  let pulangCepatMenit = 0;
  let lebihKerjaMenit = 0;
  if (!jadwal) {
    return { terlambatMenit, pulangCepatMenit, lebihKerjaMenit };
  }
  for (const b of baris) {
    // Selisih tersimpan (dinilai thd jadwal saat transaksi dicatat) dipakai
    // apa adanya; hitung ulang dari jadwal aktif hanya fallback baris lama.
    const selisih =
      b.tersimpan !== undefined && b.tersimpan !== 0
        ? b.tersimpan
        : selisihMenitDariJam(b.type, b.status, b.waktu, jadwal);
    if (selisih === null || selisih === 0) continue;
    if (b.type === "CHECK_IN" && b.status === "TERLAMBAT" && selisih > 0) {
      terlambatMenit += selisih;
    } else if (b.type === "CHECK_OUT" && b.status === "PULANG_CEPAT" && selisih < 0) {
      pulangCepatMenit += -selisih;
    } else if (b.type === "CHECK_OUT" && b.status === "LEBIH_KERJA" && selisih > 0) {
      lebihKerjaMenit += selisih;
    }
  }
  return { terlambatMenit, pulangCepatMenit, lebihKerjaMenit };
}

/** Agregat selisih untuk transaksi pribadi (`verification.serverTime`). */
export function ringkasanSelisih(
  items: readonly TransaksiWaktu[],
  jadwal: AmbangJadwal | null,
): RingkasanSelisih {
  return jumlahkanSelisih(
    items.map((a) => ({
      type: a.type,
      status: a.status,
      waktu: a.verification.serverTime,
      tersimpan: a.selisihMenit,
    })),
    jadwal,
  );
}

/** Agregat selisih untuk baris admin (GET /api/admin/presensi) yang memakai `at` + selisih tersimpan. */
export function ringkasanSelisihBarisAdmin(
  items: readonly TransaksiBarisAdmin[],
  jadwal: AmbangJadwal | null,
): RingkasanSelisih {
  return jumlahkanSelisih(
    items.map((a) => ({ type: a.type, status: a.status, waktu: a.at, tersimpan: a.selisihMenit })),
    jadwal,
  );
}

/** Evaluasi check-in terhadap jadwal. Terlambat bila melewati ambang batas. */
export function evaluateCheckIn(schedule: WorkSchedule, serverTime: Date): ScheduleEvaluation {
  const now = serverTime.getHours() * 60 + serverTime.getMinutes();
  const deadline = minutesOf(schedule.checkInDeadline);
  return {
    status: now > deadline ? "TERLAMBAT" : "TEPAT_WAKTU",
    deltaMinutes: now - deadline,
  };
}

/** Evaluasi check-out terhadap jadwal. Pulang cepat bila sebelum jam pulang. */
export function evaluateCheckOut(schedule: WorkSchedule, serverTime: Date): ScheduleEvaluation {
  const now = serverTime.getHours() * 60 + serverTime.getMinutes();
  const outStart = minutesOf(schedule.checkOutStart);
  const outEnd = minutesOf(schedule.checkOutEnd);
  if (now < outStart) {
    return { status: "PULANG_CEPAT", deltaMinutes: now - outStart };
  }
  if (now > outEnd) {
    return { status: "LEBIH_KERJA", deltaMinutes: now - outEnd };
  }
  return { status: "TEPAT_WAKTU", deltaMinutes: 0 };
}
