"use client";

import { CameraOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export type Tahap = "siap" | "kamera" | "verifikasi" | "hasil";

interface Langkah {
  label: string;
  selesai: boolean;
  gagal?: boolean;
}

/** Panel langkah-langkah verifikasi — slip dengan kepala berkas. */
function LangkahVerifikasi({ langkah }: { langkah: Langkah[] }) {
  return (
    <div className="slip">
      <div className="kepala-berkas px-4 pb-3 pt-3.5">
        <p className="label-arsip text-tinta/45">Langkah verifikasi</p>
        <span aria-hidden className="garis-kepala mt-3 block" />
      </div>
      <ul className="space-y-3 px-4 py-4">
        {langkah.map((l, i) => (
          <li key={l.label} className="flex items-start gap-3 text-[14px]">
            <span
              className={cn(
                "angka-ukur mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-tanda border text-[10.5px] font-semibold",
                l.gagal
                  ? "border-bahaya/40 bg-bahaya/10 text-bahaya"
                  : l.selesai
                    ? "border-primer-gelap/30 bg-primer text-putih"
                    : "border-garis bg-meja/60 text-tinta/35",
              )}
            >
              {l.gagal ? "!" : l.selesai ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "pt-0.5 leading-5",
                l.selesai ? "font-medium text-tinta" : "text-tinta/55",
              )}
            >
              {l.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pratinjau kamera dengan bingkai oval dan langkah verifikasi berjalan. */
export function PanelKamera({
  videoRef,
  status,
  pesan,
  onUlangi,
  langkah,
  berjalan,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: string;
  pesan: string | null;
  onUlangi: () => void;
  langkah: Langkah[];
  berjalan: boolean;
}) {
  const aktif = status === "aktif";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      <div className="bukram relative overflow-hidden rounded-lembar">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn(
            "aspect-[3/4] w-full scale-x-[-1] object-cover sm:aspect-[4/3]",
            !aktif && "opacity-0",
          )}
        />

        {/* Bingkai posisi wajah: oval + penjuru bidik emas */}
        {aktif && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="relative h-[62%] w-[52%]">
              <div className="h-full w-full rounded-[50%] border-2 border-dashed border-putih/60 shadow-[0_0_0_9999px_rgba(11,42,26,0.42)]" />
              <span className="absolute -left-1 top-1/4 h-5 w-0.5 rounded-full bg-emas-terang" />
              <span className="absolute -right-1 top-1/4 h-5 w-0.5 rounded-full bg-emas-terang" />
              <span className="absolute -left-1 bottom-1/4 h-5 w-0.5 rounded-full bg-emas-terang" />
              <span className="absolute -right-1 bottom-1/4 h-5 w-0.5 rounded-full bg-emas-terang" />
            </div>
          </div>
        )}

        {/* Readout status kamera */}
        {aktif && (
          <div className="label-arsip absolute bottom-3 left-3 rounded-tanda border border-emas/50 bg-sampul/90 px-2.5 py-1.5 text-emas-terang">
            {berjalan ? "Memeriksa…" : "Kamera aktif"}
          </div>
        )}

        {!aktif && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-putih/20 bg-putih/8">
              <CameraOff className="h-6 w-6 text-putih/70" />
            </span>
            <p className="max-w-[16rem] text-[13.5px] leading-6 text-putih/75">
              {pesan ??
                "Kamera dipakai untuk memverifikasi wajah Anda sebelum dicatat."}
            </p>
            {status === "ditolak" || status === "error" ? (
              <Button variasi="sekunder" onClick={onUlangi} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Coba lagi
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <LangkahVerifikasi langkah={langkah} />
        <div className="rounded-slip border border-garis-folio bg-folio-2 px-4 py-3.5 text-[12.5px] leading-6 text-tinta/70">
          Hadap kamera dalam bingkai oval dengan cahaya dari depan. Pemeriksaan
          otomatis membantu verifikasi, tetapi tidak dapat menjamin semua foto
          atau video tiruan terdeteksi.
        </div>
      </div>
    </div>
  );
}
