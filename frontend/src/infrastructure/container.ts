import type { AppGateways } from "@/core/ports/gateways";
import { createMockGateways } from "@/infrastructure/mock/gateways";
import { createHttpGateways } from "@/infrastructure/http/gateways";

/**
 * Titik tunggal penyediaan dependensi (komposisi).
 *
 * Bawaan memakai backend Go lewat HTTP — seluruh data dinamis (pengguna,
 * presensi, jadwal, pengajuan, laporan) berasal dari API/MySQL. Pintu data
 * contoh hanya dipakai bila diminta secara eksplisit lewat
 * NEXT_PUBLIC_API_MODE=mock, mis. untuk mengembangkan tampilan tanpa backend.
 */
export function getGateways(): AppGateways {
  return process.env.NEXT_PUBLIC_API_MODE === "mock"
    ? createMockGateways()
    : createHttpGateways();
}
