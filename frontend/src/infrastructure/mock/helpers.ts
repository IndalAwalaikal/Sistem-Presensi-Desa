import type { User } from "@/core/domain/user";
import {
  UNDANGAN_MASA_BERLAKU_HARI,
  undanganKedaluwarsa,
  type Undangan,
} from "@/core/domain/undangan";
import type { StoredUser } from "@/infrastructure/mock/seed-users";
import { muat, simpan, type Simpanan } from "@/infrastructure/mock/store";

export function keUser(u: StoredUser): User {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    accountStatus: u.accountStatus,
    biometricStatus: u.biometricStatus,
    official: u.official,
    biometricConsentAt: u.biometricConsentAt,
  };
}

/** Pengguna yang sedang masuk; gagal bila sesi tidak ada. */
export function penggunaSession(): StoredUser {
  const db = muat();
  const user = db.users.find((u) => u.id === db.sessionUserId);
  if (!user) throw new Error("Sesi berakhir. Masuk kembali.");
  return user;
}

export function catatAudit(
  actor: StoredUser,
  action: string,
  targetType: string,
  targetId: string,
  detail: string,
): void {
  const db = muat();
  db.auditLogs.unshift({
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1_000)}`,
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.fullName,
    action,
    targetType,
    targetId,
    detail,
  });
  simpan();
}

// ---------------------------------------------------------------------------
// Undangan aktivasi akun
// ---------------------------------------------------------------------------

/**
 * Abjad kode tanpa huruf/angka yang mudah tertukar saat dibacakan lewat telepon
 * atau ditulis ulang (tanpa I, O, B, S, Z, 0, 1, 2, 5, 8).
 */
const ABJAD_KODE = "ACDEFGHJKLMNPQRTUVWXY34679";

function acakKode(panjang: number): string {
  const nilai = new Uint32Array(panjang);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(nilai);
  } else {
    // Lingkungan tanpa Web Crypto (mis. Node lama) — cukup untuk data contoh.
    for (let i = 0; i < panjang; i++) nilai[i] = Math.floor(Math.random() * 0xffffffff);
  }
  return Array.from(nilai, (n) => ABJAD_KODE[n % ABJAD_KODE.length]).join("");
}

/** Kode undangan sekali pakai, mis. "ANB-7K3M-QP2X". */
export function buatKodeUndangan(): string {
  return `ANB-${acakKode(4)}-${acakKode(4)}`;
}

/** Id pengguna baru yang tetap terbaca manusia, mis. "u-nurul-hidayah-7k3m". */
export function idPenggunaBaru(nama: string): string {
  const dasar = nama
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 24);
  return `u-${dasar || "perangkat"}-${acakKode(4).toLowerCase()}`;
}

/**
 * Terbitkan kode undangan baru untuk seorang pengguna dan gugurkan kode lama
 * yang belum dipakai, sehingga hanya satu kode berlaku pada satu waktu. Kode
 * lama tetap tersimpan sebagai riwayat (ditandai kedaluwarsa), bukan dihapus,
 * supaya jejaknya masih dapat diaudit.
 */
export function terbitkanUndangan(db: Simpanan, user: StoredUser): Undangan {
  const kini = new Date();
  db.undangan = db.undangan.map((u) =>
    u.userId === user.id && !u.dipakaiPada && !undanganKedaluwarsa(u, kini)
      ? { ...u, kedaluwarsaPada: kini.toISOString() }
      : u,
  );

  const undangan: Undangan = {
    kode: buatKodeUndangan(),
    userId: user.id,
    nama: user.fullName,
    email: user.email,
    dibuatPada: kini.toISOString(),
    kedaluwarsaPada: new Date(
      kini.getTime() + UNDANGAN_MASA_BERLAKU_HARI * 86_400_000,
    ).toISOString(),
  };
  db.undangan.unshift(undangan);
  return undangan;
}

/** Gugurkan seluruh kode undangan yang belum dipakai milik seorang pengguna. */
export function gugurkanUndangan(db: Simpanan, userId: string): void {
  const kini = new Date();
  db.undangan = db.undangan.map((u) =>
    u.userId === userId && !u.dipakaiPada && !undanganKedaluwarsa(u, kini)
      ? { ...u, kedaluwarsaPada: kini.toISOString() }
      : u,
  );
}
