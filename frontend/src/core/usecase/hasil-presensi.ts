/**
 * Ringkasan layar hasil presensi — satu bentuk data untuk animasi cap
 * ("berhasil"/"gagal") beserta informasi yang menyertainya.
 *
 * Ditulis di sini, bukan di komponen, supaya nada, judul, kalimat, dan langkah
 * berikutnya hanya punya satu sumber: komponen `AnimasiHasil` tinggal
 * menggambar, dan aturannya dapat diuji tanpa DOM (paralel `attendance-status`).
 */

import {
  ATTENDANCE_MODE_LABEL,
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_TYPE_LABEL,
  type AttendanceStatus,
  type AttendanceType,
  type WorkSchedule,
} from "@/core/domain/attendance";
import type { PresensiResult } from "@/core/ports/gateways";
import { kalimatSelisihTransaksi } from "@/core/usecase/attendance-status";
import { jam } from "@/lib/waktu";

/** Nada cap: hijau dinas untuk diterima, merah untuk ditolak. */
export type NadaHasil = "primer" | "bahaya";

export interface BarisRingkas {
  readonly label: string;
  readonly nilai: string;
  /** Diisi hanya bila nilainya perlu ditonjolkan (mis. "Terlambat"). */
  readonly nada?: NadaHasil | "peringatan";
}

export interface RingkasanHasilPresensi {
  readonly diterima: boolean;
  readonly nada: NadaHasil;
  /** Tulisan mono kapital di bawah cap: "tercatat" / "tidak dicatat". */
  readonly cap: string;
  readonly judul: string;
  /**
   * Jam server resmi ("07.41") — hanya ada saat presensi diterima; tolakan
   * tidak membawa waktu server, dan waktu perangkat tidak boleh dipakai
   * sebagai penggantinya.
   */
  readonly waktu: string | null;
  /** Kalimat utama: status + selisih, atau alasan penolakan apa adanya. */
  readonly pesan: string;
  /** Langkah berikutnya — selalu terisi, supaya cap tidak menggantung. */
  readonly petunjuk: string;
  readonly baris: readonly BarisRingkas[];
}

export interface InfoHasilPresensi {
  readonly nama: string;
  readonly office: { readonly name: string; readonly radiusMeters: number };
  /** Akurasi GPS perangkat (meter) — untuk baris rincian. */
  readonly lokasi: { readonly accuracyMeters: number } | null;
  readonly jadwal: WorkSchedule | null;
}

/**
 * Langkah berikutnya untuk tiap kode tolakan. Pesannya mengarahkan tindakan,
 * bukan mengulang alasan — alasan sudah dibawa `rejection.message` dari server.
 */
const PETUNJUK_TOLAK: Record<string, string> = {
  BIOMETRIC_INACTIVE: "Selesaikan pendaftaran wajah lebih dahulu.",
  FACE_FAILED: "Ulangi dengan cahaya dari depan dan wajah penuh di dalam bingkai.",
  LIVENESS_FAILED: "Pastikan Anda sendiri yang di depan kamera — bukan foto atau video.",
  GPS_INACCURATE: "Cari tempat terbuka agar sinyal GPS stabil, lalu ulangi.",
  OUTSIDE_GEOFENCE: "Dekati area kantor desa, lalu ulangi presensi.",
  MODE_TIDAK_DISETUJUI: "Pilih mode WFO atau ajukan pengajuan WFH/dinas luar lebih dahulu.",
  SUDAH_PRESENSI: "Jenis presensi itu sudah tercatat hari ini — buka riwayat untuk melihatnya.",
  BELUM_PRESENSI_MASUK: "Lakukan presensi datang lebih dahulu hari ini.",
  SERVER_ERROR: "Coba lagi sebentar lagi; bila berulang laporkan ke sekretaris desa.",
};

/**
 * Ringkas hasil presensi menjadi bahan animasi + info.
 *
 * `jenis` diisi jenis yang baru dicoba: hasil tolakan tidak memuat transaksi,
 * jadi hanya pemanggil yang tahu apakah pengguna menekan "Masuk" atau "Pulang".
 */
export function ringkasanHasilPresensi(
  hasil: PresensiResult,
  info: InfoHasilPresensi,
  jenis?: AttendanceType,
): RingkasanHasilPresensi {
  if (hasil.accepted && hasil.attendance && hasil.verification) {
    const a = hasil.attendance;
    const v = hasil.verification;
    const selisih = kalimatSelisihTransaksi(a, info.jadwal);

    return {
      diterima: true,
      nada: "primer",
      cap: "tercatat",
      judul: "Presensi Berhasil",
      waktu: jam(v.serverTime),
      pesan: selisih ?? kalimatTanpaSelisih(a.type, a.status, info.jadwal),
      petunjuk: langkahSetelahDiterima(a.type, info.jadwal),
      baris: [
        { label: "Perangkat", nilai: info.nama },
        { label: "Jenis", nilai: ATTENDANCE_TYPE_LABEL[a.type] },
        {
          label: "Status",
          nilai: ATTENDANCE_STATUS_LABEL[a.status],
          nada:
            a.status === "TERLAMBAT"
              ? "bahaya"
              : a.status === "PULANG_CEPAT"
                ? "peringatan"
                : "primer",
        },
        {
          label: "Lokasi",
          nilai: `${info.office.name} · ${Math.round(v.geofence.distanceMeters)} m`,
        },
        { label: "Mode", nilai: ATTENDANCE_MODE_LABEL[a.mode] },
        {
          label: "Verifikasi",
          nilai: `kemiripan wajah ${v.faceScore.toFixed(2)} · skor keaslian ${v.livenessScore.toFixed(2)}`,
        },
      ],
    };
  }

  // Ditolak — atau jawaban server yang tidak lengkap; keduanya tidak dicatat,
  // jadi keduanya tampil sebagai cap merah dengan alasan yang dapat dibaca.
  const tolak = hasil.rejection;
  const kode = tolak?.code ?? "SERVER_ERROR";
  return {
    diterima: false,
    nada: "bahaya",
    cap: "tidak dicatat",
    judul: "Presensi Gagal",
    waktu: null,
    pesan: tolak?.message ?? "Terjadi gangguan saat memeriksa presensi Anda.",
    petunjuk: PETUNJUK_TOLAK[kode] ?? PETUNJUK_TOLAK.SERVER_ERROR,
    baris: [
      ...(jenis ? [{ label: "Jenis", nilai: ATTENDANCE_TYPE_LABEL[jenis] }] : []),
      { label: "Kode tolakan", nilai: kode, nada: "bahaya" as const },
      { label: "Dampak", nilai: "Tidak ada transaksi yang tercatat", nada: "bahaya" as const },
    ],
  };
}

/** Kalimat pengganti saat selisihnya nol atau tidak dapat dihitung. */
function kalimatTanpaSelisih(
  type: AttendanceType,
  status: AttendanceStatus,
  jadwal: WorkSchedule | null,
): string {
  // Transaksi lama bisa menyimpan status menyimpang tanpa durasinya; itu tidak
  // boleh disebut "tepat waktu" — sebut saja statusnya apa adanya.
  if (status !== "TEPAT_WAKTU") {
    return `${ATTENDANCE_STATUS_LABEL[status]} — durasi tidak tercatat pada transaksi ini.`;
  }
  if (!jadwal) return "Tercatat pada waktu server resmi.";
  return type === "CHECK_IN"
    ? `Datang tepat waktu — sebelum batas masuk ${jadwal.checkInDeadline}.`
    : `Pulang tepat waktu — setelah ${jadwal.checkOutStart} dan sebelum ${jadwal.checkOutEnd}.`;
}

function langkahSetelahDiterima(type: AttendanceType, jadwal: WorkSchedule | null): string {
  if (type === "CHECK_OUT") return "Kehadiran hari ini lengkap.";
  return jadwal
    ? `Presensi pulang menanti setelah pukul ${jadwal.checkOutStart}.`
    : "Kehadiran Anda tercatat hari ini.";
}
