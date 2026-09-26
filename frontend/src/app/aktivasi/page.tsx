"use client";

import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { KolofonBaris } from "@/components/ui/kolofon";
import { TeraKontur } from "@/components/ui/tera-kontur";
import { FormAktivasi } from "@/features/akun/form-aktivasi";

/**
 * Halaman aktivasi akun (publik, hanya bermakna dengan kode undangan yang sah).
 * Satu lembar — bukan buku terbuka seperti halaman masuk, karena yang datang ke
 * sini bukan sedang memilih apa pun, melainkan menyelesaikan satu langkah.
 */
export default function HalamanAktivasi() {
  return (
    <div className="bukram relative flex min-h-dvh items-center justify-center overflow-hidden px-3 py-6 sm:px-6 lg:px-10 lg:py-12">
      <TeraKontur className="absolute -right-40 -top-40 h-[46rem] w-[46rem] text-putih opacity-[0.09]" />
      <TeraKontur className="absolute -bottom-56 -left-32 h-[40rem] w-[40rem] text-putih opacity-[0.07]" />

      <div className="folio lembar-mendarat relative z-10 w-full max-w-xl overflow-hidden">
        <span aria-hidden className="garis-foil absolute inset-x-0 top-0 h-[3px]" />
        <section className="px-6 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-7 flex items-center gap-3">
              <Logo ukuran="lg" />
              <div className="min-w-0">
                <p className="font-display text-[15px] font-bold leading-tight">
                  Presensi Anabanua
                </p>
                <p className="label-arsip mt-0.5 text-tinta/45">
                  Pemerintah Desa Anabanua
                </p>
              </div>
            </div>

            <Suspense
              fallback={
                <p className="label-arsip text-tinta/45">Memuat formulir…</p>
              }
            >
              <FormAktivasi />
            </Suspense>

            <footer className="mt-10 border-t border-garis-folio pt-5">
              <KolofonBaris />
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}