"use client";

import Link from "next/link";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type NadaAksen = "netral" | "primer" | "bahaya" | "peringatan" | "info";

/**
 * Kartu statistik ringkas. Sebelumnya kartu ini terangkat 2 px saat disorot
 * (hover:-translate-y-0.5) — gerakan yang tidak berarti apa-apa. Sekarang
 * kertasnya hanya bertambah tebal dan tepinya menegas, seperti lembar yang
 * ditunjuk dengan jari.
 */
export function Stat({
  nilai,
  label,
  sub,
  nada = "netral",
  total,
}: {
  nilai: string;
  label: string;
  sub: string;
  nada?: NadaAksen;
  total?: number;
}) {
  const aksen: Record<NadaAksen, string> = {
    netral: "before:bg-tinta/25",
    primer: "before:bg-primer",
    bahaya: "before:bg-bahaya",
    peringatan: "before:bg-peringatan",
    info: "before:bg-info",
  };
  const nadaSub: Record<NadaAksen, string> = {
    netral: "text-tinta/40",
    primer: "text-primer",
    bahaya: "text-bahaya",
    peringatan: "text-peringatan",
    info: "text-info",
  };
  return (
    <div
      className={cn(
        "slip overflow-hidden px-4 pb-3.5 pt-3.5 transition-shadow hover:shadow-lembar",
        // Pita nada di tepi kiri — penanda jenis angka, bukan hiasan.
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        aksen[nada],
      )}
    >
      <p className="angka-ukur text-[26px] font-semibold leading-none tracking-[-0.02em] text-tinta">
        {nilai}
        {total !== undefined ? (
          <span className="text-[13px] font-medium text-tinta/35"> / {total}</span>
        ) : null}
      </p>
      <p className="label-arsip mt-2 text-tinta/50">{label}</p>
      <p className={cn("mt-0.5 text-[11.5px] font-medium", nadaSub[nada])}>{sub}</p>
    </div>
  );
}

/** Progres kehadiran bulan berjalan — persen + bar. */
export function KartuProgres({ hadir, target }: { hadir: number; target: number }) {
  const persen = target > 0 ? Math.min(100, Math.round((hadir / target) * 100)) : 0;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label-arsip text-tinta/45">Kehadiran bulan ini</p>
        <TrendingUp className="h-4 w-4 shrink-0 text-primer" />
      </div>
      <p className="angka-ukur mt-3 text-[34px] font-semibold leading-none tracking-[-0.03em]">
        {persen}
        <span className="text-[17px] font-medium text-tinta/55">%</span>
      </p>
      <p className="mt-2 text-[12px] text-tinta/55">
        {hadir} hari hadir dari {target} hari kerja
      </p>
      <div
        role="progressbar"
        aria-valuenow={persen}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-meja shadow-turun"
      >
        <div
          className="garis-foil h-full rounded-full transition-all duration-500"
          style={{ width: `${persen}%` }}
        />
      </div>
    </Card>
  );
}

/** Pintasan tugas yang sering dipakai. */
export function TautanCepat({ tampilAdmin }: { tampilAdmin: boolean }) {
  const tautan = [
    { href: "/pengajuan", label: "Ajukan izin / WFH", ket: "Form pengajuan & status" },
    { href: "/riwayat", label: "Kalender & riwayat", ket: "Rekap bulan berjalan" },
    ...(tampilAdmin
      ? [{ href: "/monitoring", label: "Buka monitoring", ket: "Pantau seluruh perangkat" }]
      : []),
  ];
  return (
    <Card>
      <CardHeader title="Pintasan" sub="Tugas yang sering dipakai" />
      <ul className="divide-y divide-garis-folio">
        {tautan.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="flex items-center gap-3 rounded-slip px-4 py-3 transition-colors hover:bg-folio-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{t.label}</span>
                <span className="block text-[12px] text-tinta/50">{t.ket}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-tinta/35" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
