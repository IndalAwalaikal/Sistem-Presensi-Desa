/**
 * Aturan penetapan jam kerja: validasi dan perapian sebelum jadwal disimpan.
 * Fungsi murni — paralel dengan validasi yang akan ditegakkan backend, karena
 * jam masuk/jam pulang menentukan status kedisiplinan seluruh perangkat.
 */

import { URUTAN_HARI } from "@/core/domain/attendance";
import type { UpdateScheduleCommand } from "@/core/ports/gateways";

export interface HasilValidasiJadwal {
  readonly sah: boolean;
  readonly galat: string[];
}

/** "HH:MM" 24 jam; menolak "7.30", "25:00", dan "08:60". */
const POLA_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

function menit(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Periksa jadwal kerja. Urutan jam yang mustahil ditolak di sini supaya tidak
 * ada jadwal yang membuat seluruh perangkat otomatis terlambat atau otomatis
 * pulang cepat.
 */
export function validasiJadwal(input: UpdateScheduleCommand): HasilValidasiJadwal {
  const galat: string[] = [];
  const jam = [
    ["Jam masuk", input.checkInStart],
    ["Batas masuk", input.checkInDeadline],
    ["Jam pulang", input.checkOutStart],
    ["Batas pulang", input.checkOutEnd],
  ] as const;

  for (const [label, nilai] of jam) {
    if (!POLA_JAM.test(nilai ?? "")) {
      galat.push(`${label} harus berupa jam 24 jam, mis. 08:00.`);
    }
  }

  if (input.workDays.length === 0) {
    galat.push("Pilih minimal satu hari kerja.");
  } else if (input.workDays.some((h) => !Number.isInteger(h) || h < 0 || h > 6)) {
    galat.push("Hari kerja tidak dikenal.");
  }

  if (galat.length > 0) return { sah: false, galat };

  if (menit(input.checkInStart) > menit(input.checkInDeadline)) {
    galat.push("Jam masuk tidak boleh melewati batas masuk.");
  }
  if (menit(input.checkInDeadline) > menit(input.checkOutStart)) {
    galat.push("Batas masuk harus sebelum jam pulang.");
  }
  if (menit(input.checkOutStart) >= menit(input.checkOutEnd)) {
    galat.push("Batas pulang harus setelah jam pulang.");
  }

  return { sah: galat.length === 0, galat };
}

/**
 * Rapikan jadwal yang sah: hari kerja diurutkan Senin–Sabtu dan dibebaskan dari
 * duplikat, sehingga nilai yang tersimpan sama dengan yang diperiksa.
 */
export function rapikanJadwal(input: UpdateScheduleCommand): UpdateScheduleCommand {
  return {
    checkInStart: input.checkInStart,
    checkInDeadline: input.checkInDeadline,
    checkOutStart: input.checkOutStart,
    checkOutEnd: input.checkOutEnd,
    workDays: URUTAN_HARI.filter((h) => input.workDays.includes(h)),
  };
}
