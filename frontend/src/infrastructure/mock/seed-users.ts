import type {
  AccountStatus,
  BiometricStatus,
  Official,
  Role,
} from "@/core/domain/user";
import { UNDANGAN_MASA_BERLAKU_HARI, type Undangan } from "@/core/domain/undangan";
import { jarakMeter } from "@/lib/waktu";

/** Baris pengguna pada penyimpanan contoh (termasuk kredensial demo). */
export interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  /** Kosong selama akun masih berstatus UNDANGAN (belum diaktivasi). */
  password: string;
  role: Role;
  accountStatus: AccountStatus;
  biometricStatus: BiometricStatus;
  /** Waktu persetujuan pemrosesan data wajah dicatat. */
  biometricConsentAt?: string;
  /** Waktu akun dibuat — hari kerja sebelumnya tidak dihitung tanpa keterangan. */
  dibuatPada: string;
  official: Official;
}

/**
 * Konfigurasi kantor contoh: koordinat Kantor Desa Anabanua,
 * Kec. Barru, Kab. Barru, Sulawesi Selatan (titik lapangan SMPN Satap 4
 * Barru & SDI Banga-Banga). Kalibrasi titik presisi dilakukan saat
 * pemasangan di lapangan dan disamakan dengan KANTOR_LAT/KANTOR_LNG.
 */
export const SEED_CONFIG = {
  office: {
    id: "ofc-1",
    name: "Kantor Desa Anabanua",
    point: { latitude: -4.4680072, longitude: 119.713862 },
    radiusMeters: 100,
  },
  schedule: {
    id: "sch-1",
    name: "Jadwal Kantor (WITA)",
    checkInStart: "07:30",
    checkInDeadline: "08:00",
    checkOutStart: "16:00",
    checkOutEnd: "17:00",
    workDays: [1, 2, 3, 4, 5, 6],
  },
  maxAccuracyMeters: 50,
  /** Jarak contoh pengguna dari kantor saat demo (meter). */
  demoUserDistanceMeters: 37,
} as const;

export const KATA_SANDI_DEMO = "anabanua123";

const profil = (
  employeeId: string,
  position: string,
  unit: string,
  phoneNumber: string,
): Official => ({
  employeeId,
  position,
  unit,
  phoneNumber,
  address: "Desa Anabanua, Kec. Barru, Kab. Barru",
});

export const SEED_USERS: StoredUser[] = [
  {
    id: "u-ahmad",
    fullName: "Ahmad Fauzan",
    email: "ahmad@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    password: KATA_SANDI_DEMO,
    role: "PERANGKAT_DESA",
    accountStatus: "AKTIF",
    biometricStatus: "ACTIVE",
    biometricConsentAt: "2026-06-02T01:15:00.000Z",
    official: profil("19870412 201003 2 004", "Kaur Pemerintahan", "Sekretariat Desa", "0852-4000-1001"),
  },
  {
    id: "u-siti",
    fullName: "Siti Aisyah",
    email: "siti@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    password: KATA_SANDI_DEMO,
    role: "PERANGKAT_DESA",
    accountStatus: "AKTIF",
    biometricStatus: "PENDING_VERIFICATION",
    biometricConsentAt: "2026-06-03T02:40:00.000Z",
    official: profil("19920305 201502 2 007", "Kaur Keuangan", "Sekretariat Desa", "0852-4000-1002"),
  },
  {
    id: "u-budi",
    fullName: "Budi Santoso",
    email: "budi@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    password: KATA_SANDI_DEMO,
    role: "PERANGKAT_DESA",
    accountStatus: "AKTIF",
    biometricStatus: "NOT_ENROLLED",
    official: profil("19940817 201801 1 009", "Kaur Umum", "Sekretariat Desa", "0852-4000-1003"),
  },
  {
    id: "u-dewi",
    fullName: "Dewi Lestari",
    email: "dewi@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    password: KATA_SANDI_DEMO,
    role: "PERANGKAT_DESA",
    accountStatus: "AKTIF",
    biometricStatus: "ACTIVE",
    biometricConsentAt: "2026-06-02T01:20:00.000Z",
    official: profil("19910620 201601 2 012", "Kasi Pelayanan", "Bidang Pelayanan", "0852-4000-1004"),
  },
  {
    id: "u-nurul",
    fullName: "Nurul Hidayah",
    email: "nurul@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    // Akun baru dibuatkan sekretaris/kepala desa, belum diaktivasi: kata sandi
    // belum ada dan nomor telepon masih kosong sampai yang bersangkutan mengisi
    // sendiri.
    password: "",
    role: "PERANGKAT_DESA",
    accountStatus: "UNDANGAN",
    biometricStatus: "NOT_ENROLLED",
    official: profil("19950912 201902 2 015", "Kaur Perencanaan", "Sekretariat Desa", ""),
  },
  {
    id: "u-sekretaris",
    fullName: "Rahmat Hidayat",
    email: "sekretaris@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    password: KATA_SANDI_DEMO,
    role: "SEKRETARIS_DESA",
    accountStatus: "AKTIF",
    biometricStatus: "ACTIVE",
    biometricConsentAt: "2026-06-01T03:00:00.000Z",
    official: profil("19900110 201403 1 005", "Sekretaris Desa", "Sekretariat Desa", "0852-4000-2001"),
  },
  {
    id: "u-kepala",
    fullName: "H. Abdul Malik",
    email: "kepala@anabanua.id",
    dibuatPada: "2026-06-01T03:00:00.000Z",
    password: KATA_SANDI_DEMO,
    role: "KEPALA_DESA",
    accountStatus: "AKTIF",
    biometricStatus: "ACTIVE",
    biometricConsentAt: "2026-06-01T03:05:00.000Z",
    official: profil("19750820 200501 1 011", "Kepala Desa", "Pemerintah Desa", "0852-4000-3001"),
  },
];

/**
 * Kode undangan contoh untuk akun Nurul Hidayah yang masih berstatus UNDANGAN —
 * supaya alur `/aktivasi` dapat dicoba langsung di mode demo.
 */
export const KODE_UNDANGAN_DEMO = "ANB-NURL-4821";

/** Undangan awal; masa berlakunya dihitung dari waktu pemuatan data. */
export function undanganAwal(kini: Date = new Date()): Undangan[] {
  const kedaluwarsa = new Date(
    kini.getTime() + UNDANGAN_MASA_BERLAKU_HARI * 86_400_000,
  );
  return [
    {
      kode: KODE_UNDANGAN_DEMO,
      userId: "u-nurul",
      nama: "Nurul Hidayah",
      email: "nurul@anabanua.id",
      dibuatPada: kini.toISOString(),
      kedaluwarsaPada: kedaluwarsa.toISOString(),
    },
  ];
}

/** Titik demo: DEMO_DISTANCE meter ke timur laut dari kantor. */
export function posisiDemo(): {
  latitude: number;
  longitude: number;
} {
  const kantor = SEED_CONFIG.office.point;
  const jarak = SEED_CONFIG.demoUserDistanceMeters;
  const dLat = jarak / 111_320;
  const dLng = jarak / (111_320 * Math.cos((kantor.latitude * Math.PI) / 180));
  return { latitude: kantor.latitude + dLat, longitude: kantor.longitude + dLng };
}

export function jarakDemo(): number {
  const p = posisiDemo();
  return jarakMeter(p, SEED_CONFIG.office.point);
}
