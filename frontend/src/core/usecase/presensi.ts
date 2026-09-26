/**
 * Use case presensi: orkestrasi keputusan transaksi presensi.
 * Data kamera/liveness/GPS dikumpulkan oleh presentasi, lalu keputusan bisnis
 * (biometrik aktif, skor, geofence, jadwal, waktu server) dihitung di sini —
 * paralel dengan logika backend Go.
 */

import {
  evaluateGeofence,
  modeWajibPengajuan,
  type Attendance,
  type AttendanceMode,
  type AttendanceType,
  type OfficeLocation,
  type VerificationMeta,
  type WorkSchedule,
} from "@/core/domain/attendance";
import { evaluateCheckIn, evaluateCheckOut } from "@/core/usecase/attendance-status";
import type { BiometricStatus } from "@/core/domain/user";
import type { PresensiResult, SubmitPresensiCommand } from "@/core/ports/gateways";

/**
 * Ambang cosine mentah untuk mode mock. Produksi mengambil skor dan keputusan
 * biometrik dari backend; kalibrasi nilai produksi tetap harus memakai data
 * autentik dan percobaan tidak sah di kondisi lapangan.
 */
export const FACE_THRESHOLD = 0.62;
export const LIVENESS_THRESHOLD = 0.5;

export interface PresensiContext {
  readonly biometricStatus: BiometricStatus;
  readonly office: OfficeLocation;
  readonly schedule: WorkSchedule;
  readonly maxAccuracyMeters: number;
  /** Waktu server resmi — bukan waktu perangkat. */
  readonly serverTime: Date;
  /**
   * Jenis presensi yang **sudah** tercatat hari ini untuk pengguna ini. Presensi
   * datang dan pulang adalah dua transaksi yang berdiri sendiri (dipilih
   * pengguna, bukan ditebak sistem), jadi urutannya harus dijaga: datang lebih
   * dahulu, sekali saja per hari.
   */
  readonly sudahPresensi: readonly AttendanceType[];
  /**
   * Mode yang diakui pengajuan yang disetujui hari ini (mis. WFH, DINAS_LUAR).
   *
   * Dipakai dua arah, paralel backend `modeTerbukaHariIni`: mode yang menuntut
   * pengajuan tetapi tidak ada di daftar ini ditolak, dan mode yang ada di sini
   * tidak lagi terikat radius/akurasi kantor — orangnya memang tidak di kantor.
   * Kosong = hanya WFO yang sah.
   */
  readonly modeDisetujui?: readonly AttendanceMode[];
}

export function decidePresensi(
  command: SubmitPresensiCommand,
  ctx: PresensiContext,
): PresensiResult {
  if (ctx.biometricStatus !== "ACTIVE") {
    return rejected("BIOMETRIC_INACTIVE", "Biometrik belum aktif. Selesaikan verifikasi pendaftaran wajah terlebih dahulu.");
  }

  // Urutan presensi diperiksa sebelum verifikasi kamera: menolak lebih awal
  // menghemat waktu pengguna yang salah menekan tombol.
  if (ctx.sudahPresensi.includes(command.type)) {
    return rejected(
      "SUDAH_PRESENSI",
      command.type === "CHECK_IN"
        ? "Presensi datang hari ini sudah tercatat. Yang tersisa adalah presensi pulang."
        : "Presensi pulang hari ini sudah tercatat.",
    );
  }
  if (command.type === "CHECK_OUT" && !ctx.sudahPresensi.includes("CHECK_IN")) {
    return rejected(
      "BELUM_PRESENSI_MASUK",
      "Belum ada presensi datang hari ini. Lakukan presensi datang terlebih dahulu.",
    );
  }

  if (command.faceScore < FACE_THRESHOLD) {
    return rejected("FACE_FAILED", "Wajah tidak sesuai atau kurang jelas. Ulangi dengan pencahayaan yang baik.");
  }
  if (command.livenessScore < LIVENESS_THRESHOLD) {
    return rejected("LIVENESS_FAILED", "Deteksi keaslian gagal. Pastikan Anda berada di depan kamera, bukan foto atau video.");
  }

  // Mode WFH/dinas luar hanya sah bila ada pengajuannya; bila sah, syarat lokasi
  // memang tidak berlaku — vonisnya INSIDE karena yang dinilai adalah "apakah
  // syarat lokasi terpenuhi", sedangkan jarak & akurasi tetap tercatat.
  const bebasGeofence = (ctx.modeDisetujui ?? []).includes(command.mode);
  if (modeWajibPengajuan(command.mode) && !bebasGeofence) {
    return rejected(
      "MODE_TIDAK_DISETUJUI",
      `Mode ${command.mode} hanya berlaku bagi pengajuan yang disetujui hari ini. Pilih mode WFO atau ajukan pengajuan terlebih dahulu.`,
    );
  }

  const geofenceTertukur = evaluateGeofence(
    command.location,
    command.accuracyMeters,
    ctx.office,
    ctx.maxAccuracyMeters,
  );
  const geofence = bebasGeofence
    ? { ...geofenceTertukur, verdict: "INSIDE" as const }
    : geofenceTertukur;
  if (geofence.verdict === "INACCURATE") {
    return rejected(
      "GPS_INACCURATE",
      `Sinyal GPS tidak stabil (akurasi ±${Math.round(geofence.accuracyMeters)} m). Cari tempat dengan sinyal lebih baik, lalu ulangi.`,
    );
  }
  if (geofence.verdict === "OUTSIDE") {
    return rejected(
      "OUTSIDE_GEOFENCE",
      `Anda ${Math.round(geofence.distanceMeters)} m dari ${ctx.office.name} (batas ${ctx.office.radiusMeters} m). Pindah ke dalam area kerja.`,
    );
  }

  const verification: VerificationMeta = {
    faceMatch: true,
    faceScore: round(command.faceScore),
    liveness: true,
    livenessScore: round(command.livenessScore),
    geofence,
    serverTime: ctx.serverTime.toISOString(),
  };

  const hasilEvaluasi =
    command.type === "CHECK_IN"
      ? evaluateCheckIn(ctx.schedule, ctx.serverTime)
      : evaluateCheckOut(ctx.schedule, ctx.serverTime);

  // Selisih menit disimpan bersama statusnya (paralel backend `Kirim`):
  // rekap memakai angka ini apa adanya supaya tetap konsisten walau jadwal
  // diubah di tengah bulan. Hanya status menyimpang yang menyimpan selisih.
  const selisihSimpan =
    hasilEvaluasi.status === "TERLAMBAT" ||
    hasilEvaluasi.status === "PULANG_CEPAT" ||
    hasilEvaluasi.status === "LEBIH_KERJA"
      ? hasilEvaluasi.deltaMinutes
      : 0;

  const attendance: Attendance = {
    id: `att-${Date.now()}`,
    userId: "",
    userName: "",
    type: command.type,
    mode: command.mode,
    status: hasilEvaluasi.status,
    selisihMenit: selisihSimpan,
    office: { id: ctx.office.id, name: ctx.office.name },
    verification,
  };
  return { accepted: true, attendance, verification };
}

function rejected(code: PresensiResult["rejection"] extends undefined ? never : NonNullable<PresensiResult["rejection"]>["code"], message: string): PresensiResult {
  return { accepted: false, rejection: { code, message } };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type { AttendanceType, AttendanceMode };
