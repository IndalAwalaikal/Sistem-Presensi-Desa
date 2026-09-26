"use client";

import { useCallback, useState } from "react";

/**
 * Salin teks ke papan klip dengan umpan balik singkat. Papan klip bisa ditolak
 * (halaman non-HTTPS atau kebijakan peramban), karena itu kegagalannya
 * dilaporkan supaya teks masih dapat disalin manual oleh pengelola akun.
 */
export function useSalin() {
  const [tersalin, setTersalin] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);

  const salin = useCallback(async (kunci: string, teks: string) => {
    try {
      await navigator.clipboard.writeText(teks);
      setGagal(false);
      setTersalin(kunci);
      window.setTimeout(() => {
        setTersalin((kini) => (kini === kunci ? null : kini));
      }, 2000);
    } catch {
      setGagal(true);
    }
  }, []);

  return { tersalin, gagal, salin };
}

/**
 * Tautan aktivasi lengkap. Origin hanya ada di peramban, jadi pemanggil
 * memakainya saat menekan tombol (bukan saat render) agar HTML server dan
 * klien tetap sama.
 */
export function tautanAktivasi(kode: string): string {
  const jalur = `/aktivasi?kode=${encodeURIComponent(kode)}`;
  return typeof window === "undefined"
    ? jalur
    : `${window.location.origin}${jalur}`;
}

/**
 * Kalimat masa berlaku kode undangan yang dipakai bersama kartu dan baris daftar.
 */
export function masaBerlaku(sisaHari: number): string {
  if (sisaHari <= 0) return "sudah kedaluwarsa";
  return `berlaku ${sisaHari} hari lagi`;
}