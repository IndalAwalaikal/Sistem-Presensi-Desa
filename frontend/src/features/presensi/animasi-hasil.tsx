"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { RingkasanHasilPresensi } from "@/core/usecase/hasil-presensi";

/** Lama hasil tampil sebelum rincian dibuka (ms). */
const DURASI_TIRAI = 2200;
/** Reduced motion mengurangi gerak, tetapi tetap memberi waktu membaca. */
const DURASI_TIRAI_TANPA_GERAK = 2000;

/**
 * Animasi centang hijau / silang merah (2–2,2 detik):
 * Muncul dengan animasi centang/silang tergambar, menampilkan "Presensi Berhasil"
 * atau "Presensi Gagal", lalu langsung beralih menampilkan halaman rincian penuh.
 */
export function AnimasiHasil({
  ringkasan,
  onSelesai,
  durasiMs = DURASI_TIRAI,
}: {
  ringkasan: RingkasanHasilPresensi;
  onSelesai: () => void;
  /** Lama tirai terbuka (ms). */
  durasiMs?: number;
}) {
  const diterima = ringkasan.diterima;
  const gagal = !diterima;
  const warna = gagal ? "var(--ds-bahaya)" : "var(--ds-primer)";

  const [durasi] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? Math.min(durasiMs, DURASI_TIRAI_TANPA_GERAK)
      : durasiMs,
  );
  const selesaiRef = useRef(onSelesai);
  useEffect(() => {
    selesaiRef.current = onSelesai;
  }, [onSelesai]);

  useEffect(() => {
    const jeda = setTimeout(() => selesaiRef.current(), durasi);
    return () => clearTimeout(jeda);
  }, [durasi]);

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "tirai-hasil fixed inset-0 z-50 flex items-center justify-center p-4 bg-sampul/45 backdrop-blur-[3px]",
      )}
    >
      <div className="kartu-cap folio relative my-auto w-full max-w-xs overflow-hidden rounded-2xl px-6 pb-6 pt-7 text-center shadow-2xl">
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-[3px]",
            gagal ? "bg-bahaya" : "garis-foil bg-primer",
          )}
        />

        {/* Animasi centang hijau (berhasil) atau silang merah (gagal) */}
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <span
            aria-hidden
            className={cn(
              "absolute inset-1 rounded-full animate-ping opacity-25",
              gagal ? "bg-bahaya" : "bg-primer",
            )}
            style={{ animationDuration: "0.9s", animationIterationCount: 1 }}
          />
          <span
            aria-hidden
            className={cn(
              "absolute inset-1 rounded-full",
              gagal ? "bg-bahaya/10" : "bg-primer/10",
            )}
          />

          <svg
            viewBox="0 0 128 128"
            aria-hidden
            className={cn("relative h-20 w-20", gagal && "cap-gentar")}
          >
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke={warna}
              strokeWidth="4"
              className="cap-cincin"
            />
            <path
              d={
                gagal
                  ? "M 44 44 L 84 84 M 84 44 L 44 84"
                  : "M 40 66 L 56 82 L 88 48"
              }
              fill="none"
              stroke={warna}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="cap-tanda"
              style={{ "--panjang-tanda": gagal ? 102 : 68 } as React.CSSProperties}
            />
          </svg>
        </div>

        {/* Judul Status */}
        <h2
          className={cn(
            "isi-naik mt-4 font-display text-[22px] font-bold tracking-[-0.015em]",
            gagal ? "text-bahaya" : "text-primer",
          )}
          style={{ animationDelay: "0.22s" }}
        >
          {diterima ? "Presensi Berhasil" : "Presensi Gagal"}
        </h2>

        {/* Keterangan Ringkas */}
        <p
          className="isi-naik mt-1.5 text-[13px] leading-snug text-tinta/75"
          style={{ animationDelay: "0.3s" }}
        >
          {ringkasan.pesan}
        </p>

        {/* Waktu presensi server */}
        {ringkasan.waktu ? (
          <p
            className="isi-naik mt-2 text-[12px] text-tinta/50"
            style={{ animationDelay: "0.38s" }}
          >
            <span className="angka-ukur font-semibold text-tinta/80">
              {ringkasan.waktu}
            </span>{" "}
            WITA · Waktu server resmi
          </p>
        ) : null}

        {/* Garis jalan durasi di bawah kartu */}
        <span
          aria-hidden
          className={cn(
            "garis-jalan absolute inset-x-0 bottom-0 h-[3px]",
            gagal ? "bg-bahaya/45" : "bg-primer/45",
          )}
          style={{ animationDuration: `${durasi}ms` }}
        />
      </div>
    </div>
  );
}
