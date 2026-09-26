/**
 * Entitas dan konstanta domain Pengguna/Perangkat Desa.
 * Murni TypeScript — tanpa dependensi framework (lapisan domain).
 */

export const ROLES = ["PERANGKAT_DESA", "SEKRETARIS_DESA", "KEPALA_DESA"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  PERANGKAT_DESA: "Perangkat Desa",
  SEKRETARIS_DESA: "Sekretaris Desa",
  KEPALA_DESA: "Kepala Desa",
};

/**
 * Peran yang berhak mengakses panel administrasi — hanya dua: sekretaris desa
 * dan kepala desa. Keduanya setara. Tidak ada peran teknis tambahan supaya
 * kewenangan besar tetap melekat pada jabatan resmi desa.
 */
export const ADMIN_ROLES: Role[] = ["SEKRETARIS_DESA", "KEPALA_DESA"];
/** Peran yang berhak menyetujui pengajuan (sama dengan pengelola akun). */
export const APPROVER_ROLES: Role[] = ["SEKRETARIS_DESA", "KEPALA_DESA"];

/**
 * Status akun. Akun perangkat desa dibuatkan sekretaris/kepala desa (bukan
 * mendaftar sendiri, dokumen §6), jadi sebelum dipakai akun berada pada status
 * UNDANGAN: kata sandi belum ada dan hanya dapat diisi lewat kode undangan sekali
 * pakai.
 */
export const ACCOUNT_STATUSES = ["UNDANGAN", "AKTIF", "NONAKTIF"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  UNDANGAN: "Menunggu Aktivasi",
  AKTIF: "Aktif",
  NONAKTIF: "Nonaktif",
};

export const BIOMETRIC_STATUSES = ["NOT_ENROLLED", "PENDING_VERIFICATION", "ACTIVE", "REJECTED", "EXPIRED"] as const;
export type BiometricStatus = (typeof BIOMETRIC_STATUSES)[number];

export const BIOMETRIC_LABEL: Record<BiometricStatus, string> = {
  NOT_ENROLLED: "Belum Terdaftar",
  PENDING_VERIFICATION: "Menunggu Verifikasi",
  ACTIVE: "Aktif",
  REJECTED: "Ditolak",
  EXPIRED: "Kedaluwarsa",
};

export interface Official {
  /** NIP atau NIK administrasi desa. */
  readonly employeeId: string;
  readonly position: string;
  /** Bagian/unit kerja, mis. "Sekretariat Desa". */
  readonly unit: string;
  readonly phoneNumber: string;
  readonly address: string;
}

export interface User {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: Role;
  readonly accountStatus: AccountStatus;
  readonly biometricStatus: BiometricStatus;
  readonly official: Official;
  /** Waktu persetujuan pemrosesan data wajah dicatat (dokumen §19). */
  readonly biometricConsentAt?: string;
  /** Foto profil berupa data URL kecil; opsional. */
  readonly photoUrl?: string;
}

export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isApproverRole(role: Role): boolean {
  return APPROVER_ROLES.includes(role);
}

/**
 * Peran yang boleh diberikan oleh aktor tertentu saat membuat akun. Dari
 * aplikasi hanya akun perangkat desa yang dapat didaftarkan; akun administratif
 * (sekretaris dan kepala desa) jumlahnya tetap dua dan ditetapkan langsung di
 * basis data, sehingga tidak ada cara menaikkan hak akses sendiri.
 */
export function peranYangBolehDibuat(aktor: Role): Role[] {
  return isAdminRole(aktor) ? ["PERANGKAT_DESA"] : [];
}

export function bolehTetapkanRole(aktor: Role, peran: Role): boolean {
  return peranYangBolehDibuat(aktor).includes(peran);
}

/**
 * Boleh mengubah status/kata sandi akun lain? Sekretaris dan kepala desa
 * kedudukannya setara: masing-masing hanya mengelola akun perangkat desa —
 * tidak akun administratif, termasuk akun satu sama lain.
 */
export function bolehKelolaAkun(aktor: Role, peranSasaran: Role): boolean {
  return isAdminRole(aktor) && peranSasaran === "PERANGKAT_DESA";
}

/**
 * Boleh menetapkan jam kerja kantor (jam masuk & jam pulang)?
 *
 * Jam kerja adalah kebijakan desa: kepala desa yang memutuskan, sekretaris desa
 * yang menjalankan administrasinya. Karena keduanya memang setara
 * (`ADMIN_ROLES`), keduanya diberi kewenangan yang sama — dan perangkat desa
 * tidak. Ini satu-satunya tempat aturan itu ditulis: bila desa ingin
 * membatasinya khusus kepala desa, cukup ganti isi fungsi ini menjadi
 * `aktor === "KEPALA_DESA"` tanpa menyentuh antarmuka maupun pintu data.
 */
export function bolehKelolaJadwal(aktor: Role): boolean {
  return isAdminRole(aktor);
}

/** Akun siap dipakai masuk dan presensi? */
export function akunDapatMasuk(status: AccountStatus): boolean {
  return status === "AKTIF";
}

/** Status biometrik mengizinkan presensi? */
export function canDoPresensi(status: BiometricStatus): boolean {
  return status === "ACTIVE";
}
