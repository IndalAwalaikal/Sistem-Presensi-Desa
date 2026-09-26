/**
 * Entitas pendaftaran biometrik wajah (face enrollment).
 * Murni TypeScript — tanpa dependensi framework (lapisan domain).
 */

export const ENROLLMENT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Menunggu Verifikasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

export interface EnrollmentPhoto {
  /** Data URL foto wajah hasil kamera. */
  readonly dataUrl: string;
  /** Metadata kualitas versi lama; tidak digunakan untuk keputusan biometrik. */
  readonly quality?: number;
  readonly capturedAt: string;
}

export interface FaceEnrollment {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly status: EnrollmentStatus;
  readonly photos: readonly EnrollmentPhoto[];
  readonly submittedAt?: string;
  readonly reviewedAt?: string;
  readonly reviewerNote?: string;
}

/** Jumlah foto minimum/maximum yang diminta saat pendaftaran. */
export const ENROLLMENT_MIN_PHOTOS = 3;
export const ENROLLMENT_MAX_PHOTOS = 5;
