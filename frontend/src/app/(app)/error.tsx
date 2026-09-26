"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Kesalahan({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="folio mx-auto max-w-md px-6 py-9 text-center sm:px-8">
      <span aria-hidden className="mx-auto block h-[3px] w-10 rounded-full bg-bahaya" />
      <h2 className="mt-4 font-display text-[19px] font-bold tracking-[-0.015em]">
        Terjadi gangguan
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-[13.5px] leading-6 text-tinta/60">
        Halaman gagal dimuat. Periksa koneksi Anda, lalu coba lagi. Bila
        berulang, laporkan ke sekretaris desa.
      </p>
      <Button onClick={reset} className="mt-6">
        Coba lagi
      </Button>
    </section>
  );
}
