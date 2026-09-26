/**
 * Aturan penetapan lokasi kantor: memeriksa titik & radius geofence sebelum
 * disimpan. Fungsi murni — paralel dengan validasi backend (`POST /admin/kantor`),
 * karena titik inilah yang menentukan presensi siapa pun diterima atau ditolak:
 * titik yang salah membuat seluruh perangkat desa tercatat di luar area.
 */

import type { UpdateOfficeCommand } from "@/core/ports/gateways";

export interface HasilValidasiKantor {
  readonly sah: boolean;
  readonly galat: string[];
}

/**
 * Batas radius geofence — sama dengan batas backend. Terlalu kecil membuat
 * presensi mustahil (pengukuran GPS bergeser beberapa meter), terlalu besar
 * membuat geofence kehilangan artinya.
 */
export const RADIUS_MIN_METER = 20;
export const RADIUS_MAKS_METER = 1000;

/** Koordinat wajib bilangan sungguhan: isian kosong (`NaN`) ditolak, bukan dibaca 0. */
function koordinatSah(nilai: number, batas: number): boolean {
  return Number.isFinite(nilai) && nilai >= -batas && nilai <= batas;
}

/**
 * Periksa rencana perubahan lokasi kantor. Seluruh galat dikumpulkan sekaligus
 * supaya pengelola akun tidak memperbaiki satu bidang lalu menekan simpan
 * berkali-kali.
 */
export function validasiKantor(input: UpdateOfficeCommand): HasilValidasiKantor {
  const galat: string[] = [];

  if (!input.name.trim()) {
    galat.push("Nama kantor wajib diisi.");
  }
  if (!koordinatSah(input.latitude, 90)) {
    galat.push("Garis lintang harus antara -90 dan 90.");
  }
  if (!koordinatSah(input.longitude, 180)) {
    galat.push("Garis bujur harus antara -180 dan 180.");
  }
  if (
    !Number.isInteger(input.radiusMeters) ||
    input.radiusMeters < RADIUS_MIN_METER ||
    input.radiusMeters > RADIUS_MAKS_METER
  ) {
    galat.push(
      `Radius geofence harus ${RADIUS_MIN_METER} sampai ${RADIUS_MAKS_METER} meter.`,
    );
  }

  return { sah: galat.length === 0, galat };
}

/**
 * Rapikan rencana sebelum disimpan: nama tanpa spasi berlebih dan radius bulat
 * dalam meter, sehingga yang tersimpan sama dengan yang diperiksa.
 */
export function rapikanKantor(input: UpdateOfficeCommand): UpdateOfficeCommand {
  return {
    name: input.name.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters: Math.round(input.radiusMeters),
  };
}
