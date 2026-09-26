/**
 * Entitas pengajuan (WFH, izin, sakit, cuti, dinas luar, koreksi presensi)
 * dan log audit.
 * Murni TypeScript — tanpa dependensi framework (lapisan domain).
 */

import type { AttendanceMode } from "@/core/domain/attendance";

export const REQUEST_TYPES = [
  "WFH",
  "IZIN",
  "SAKIT",
  "CUTI",
  "DINAS_LUAR",
  "KOREKSI_PRESENSI",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  WFH: "WFH",
  IZIN: "Izin",
  SAKIT: "Sakit",
  CUTI: "Cuti",
  DINAS_LUAR: "Dinas Luar",
  KOREKSI_PRESENSI: "Koreksi Presensi",
};

export const REQUEST_STATUSES = [
  "MENUNGGU",
  "DISETUJUI",
  "DITOLAK",
  "DIBATALKAN",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  MENUNGGU: "Menunggu",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  DIBATALKAN: "Dibatalkan",
};

/**
 * Pengajuan yang menjelaskan ketidakhadiran: hari kerja yang dicakupnya tidak
 * dihitung "tanpa keterangan" dan tidak menuntut presensi.
 *
 * WFH dan dinas luar TIDAK termasuk — keduanya tetap wajib presensi (mode
 * WFH/DINAS_LUAR), dan KOREKSI_PRESENSI memperbaiki transaksi, bukan menghapus
 * kewajiban. Paralel dengan `RequestType.MenutupKehadiran()` di backend.
 */
export function menutupKehadiran(tipe: RequestType): boolean {
  return tipe === "IZIN" || tipe === "SAKIT" || tipe === "CUTI";
}

/**
 * Mode presensi yang diakui pengajuan yang TIDAK menutup kehadiran — WFH tetap
 * wajib presensi dengan mode WFH, dinas luar dengan mode DINAS_LUAR, keduanya
 * tanpa syarat radius kantor. Paralel `RequestType.ModeTerbuka()` di backend:
 * satu aturan dipakai untuk menyarankan mode pada status harian sekaligus
 * memverifikasi mode yang dikirim klien.
 */
export function modeTerbuka(tipe: RequestType): AttendanceMode | null {
  if (tipe === "WFH") return "WFH";
  if (tipe === "DINAS_LUAR") return "DINAS_LUAR";
  return null;
}


export interface WorkRequest {
  readonly id: string;
  readonly type: RequestType;
  readonly userId: string;
  readonly userName: string;
  /** Rentang pengajuan (ISO date, inklusif). */
  readonly startDate: string;
  readonly endDate: string;
  /** Alasan/uraian pengajuan; untuk koreksi berisi rincian perubahan. */
  readonly reason: string;
  readonly status: RequestStatus;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly decidedByName?: string;
  readonly decisionNote?: string;
  /**
   * Penanda pengajuan massal (mis. cuti bersama): beberapa baris berbagi
   * batchId yang sama. Kosong = pengajuan tunggal. Paralel `WorkRequest.BatchID`
   * backend; hanya dipakai untuk menampilkan & menyaring.
   */
  readonly batchId?: string;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLog {
  readonly id: string;
  readonly at: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly detail: string;
}
