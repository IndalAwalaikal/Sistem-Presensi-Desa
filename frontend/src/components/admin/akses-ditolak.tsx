"use client";

import { TautanTombol } from "@/components/ui/button";

/** Penutup halaman administrasi untuk peran yang tidak berhak. */
export function AksesDitolak() {
  return (
    <section className="folio mx-auto max-w-md px-6 py-9 text-center sm:px-8">
      <span aria-hidden className="mx-auto block h-[3px] w-10 rounded-full bg-bahaya" />
      <h2 className="mt-4 font-display text-[19px] font-bold tracking-[-0.015em]">
        Akses khusus administrasi
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-[13.5px] leading-6 text-tinta/60">
        Halaman ini hanya untuk sekretaris desa dan kepala desa.
      </p>
      <TautanTombol href="/dashboard" className="mt-6">
        Kembali ke dashboard
      </TautanTombol>
    </section>
  );
}

