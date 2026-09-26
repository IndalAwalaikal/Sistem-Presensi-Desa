"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { Kolofon } from "@/components/ui/kolofon";
import { TeraKontur } from "@/components/ui/tera-kontur";
import type { ItemNav } from "@/features/navigasi/daftar-nav";

/**
 * Grup navigasi sebagai deretan tab arsip: setiap item menempel pada tepi kiri
 * sampul (punggung buku) dan hanya sisi kanannya yang melengkung, sehingga
 * bentuknya menyimpan arti — ini tab yang disisipkan di punggung register.
 * Saat sidebar dilipat menjadi rel ikon (`padat`), judul grup diganti garis
 * tipis dan tiap item menyimpan namanya pada aria-label/title.
 */
function GrupNav({
  judul,
  items,
  pathname,
  ikonJudul,
  padat,
}: {
  judul: string;
  items: ItemNav[];
  pathname: string;
  ikonJudul?: React.ReactNode;
  padat: boolean;
}) {
  return (
    <nav aria-label={judul}>
      {padat ? (
        <span aria-hidden className="mx-auto mb-1.5 mt-1 block h-px w-8 bg-putih/25" />
      ) : (
        <p className="mb-1.5 flex items-center gap-1.5 px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-putih/75">
          {ikonJudul}
          {judul}
        </p>
      )}
      <ul className={cn("space-y-1", padat && "px-2")}>
        {items.map((item) => {
          const aktif = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={aktif ? "page" : undefined}
                aria-label={padat ? item.label : undefined}
                title={padat ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-r-kendali border-l-2 py-2.5 text-[13.5px] transition-colors",
                  padat ? "justify-center" : "gap-2.5 pl-5 pr-3.5",
                  aktif
                    ? "border-emas bg-putih/15 font-semibold text-putih"
                    : "border-transparent font-medium text-putih/85 hover:border-putih/30 hover:bg-putih/10 hover:text-putih",
                )}
              >
                <item.ikon
                  className="h-[16px] w-[16px] shrink-0"
                  strokeWidth={aktif ? 2.1 : 1.75}
                />
                {!padat ? <span className="min-w-0 truncate">{item.label}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Isi sampul — dipakai dua kali: sidebar desktop yang dapat dilipat, dan laci
 * ponsel yang selalu terbuka penuh. Satu sumber isi, dua wadah.
 *
 * Tipografi mengikuti lembar isi: seluruh teks navigasi memakai huruf
 * antarmuka yang sama dengan halaman (Public Sans), bukan campuran serif/mono
 * kecil — hierarki cukup dibedakan lewat ukuran, ketebalan, dan kapitalisasi.
 */
function IsiSidebar({
  pathname,
  itemsUtama,
  itemsAdmin,
  tampilAdmin,
  nama,
  peran,
  onKeluar,
  padat,
  kontrol,
}: {
  pathname: string;
  itemsUtama: ItemNav[];
  itemsAdmin: ItemNav[];
  tampilAdmin: boolean;
  nama: string;
  peran: string;
  onKeluar: () => void;
  /** Rel ikon: tanpa teks label, hanya ikon dan inisial. */
  padat: boolean;
  /** Tombol kendali di kepala sampul (lipat/buka/X). */
  kontrol: React.ReactNode;
}) {
  return (
    <>
      <div className={cn("relative z-10", padat ? "px-3 pb-4 pt-5" : "px-5 pb-5 pt-6")}>
        {padat ? (
          <div className="flex flex-col items-center gap-3">
            <Logo ukuran="sm" />
            {kontrol}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Logo ukuran="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-putih">
                Presensi Anabanua
              </p>
              <p className="mt-0.5 text-[11.5px] leading-tight text-putih/40">
                Desa Anabanua · Barru
              </p>
            </div>
            {kontrol}
          </div>
        )}
        <span aria-hidden className="garis-foil mt-4 block h-px w-full opacity-60" />
      </div>

      <div className="relative z-10 pb-1 pt-1">
        <GrupNav judul="Menu" items={itemsUtama} pathname={pathname} padat={padat} />
      </div>

      {tampilAdmin ? (
        <div className="relative z-10 mt-6 border-t border-sampul-garis/60 pt-5">
          <GrupNav
            judul="Administrasi"
            items={itemsAdmin}
            pathname={pathname}
            ikonJudul={<ShieldCheck className="h-3.5 w-3.5" />}
            padat={padat}
          />
        </div>
      ) : null}

      <div
        className={cn(
          "relative z-10 mt-auto border-t border-sampul-garis/60",
          padat ? "flex flex-col items-center px-2 py-4" : "p-4",
        )}
      >
        <div
          className={cn(
            "mb-3 flex",
            padat ? "flex-col items-center gap-2" : "items-center gap-3",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tanda border border-putih/25 bg-putih/8 text-[11px] font-semibold text-putih">
            {inisial(nama)}
          </span>
          {!padat ? (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-putih">{nama}</p>
              <p className="mt-px truncate text-[11.5px] font-medium leading-tight text-putih/75">
                {peran}
              </p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onKeluar}
          title={padat ? "Keluar" : undefined}
          aria-label={padat ? "Keluar" : undefined}
          className={cn(
            "flex w-full items-center gap-2 rounded-kendali py-2 text-[13px] font-medium text-putih/85 transition-colors hover:bg-bahaya/25 hover:text-putih",
            padat ? "justify-center px-0" : "px-2.5",
          )}
        >
          <LogOutIkon />
          {!padat ? "Keluar" : null}
        </button>

        {!padat ? (
          <Kolofon nada="sampul" className="mt-5 border-t border-sampul-garis/60 pt-4" />
        ) : null}
      </div>
    </>
  );
}

/*
 * Sampul register. Desktop: sidebar yang dapat dilipat menjadi rel ikon —
 * lebarnya beranimasi bersama pergeseran lembar isi, dan pilihan diingat.
 * Ponsel: laci di atas layar dengan tirai redup — dibuka dari pita sampul,
 * ditutup dengan X, tirai, Escape, atau pindah halaman.
 */
export function SidebarDesktop({
  pathname,
  itemsUtama,
  itemsAdmin,
  tampilAdmin,
  nama,
  peran,
  terbuka,
  onToggle,
  laciTerbuka,
  onTutupLaci,
  laciRef,
  onKeluar,
}: {
  pathname: string;
  itemsUtama: ItemNav[];
  itemsAdmin: ItemNav[];
  tampilAdmin: boolean;
  nama: string;
  peran: string;
  /** Desktop: sidebar penuh atau rel ikon. */
  terbuka: boolean;
  onToggle: () => void;
  /** Ponsel: laci navigasi terbuka. */
  laciTerbuka: boolean;
  onTutupLaci: () => void;
  laciRef: React.RefObject<HTMLElement | null>;
  onKeluar: () => void;
}) {
  return (
    <>
      <aside
        className={cn(
          "bukram fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto overflow-x-hidden text-putih/70 scroll-halus transition-[width] duration-300 ease-out motion-reduce:transition-none lg:flex",
          terbuka ? "w-64" : "w-[4.5rem]",
        )}
      >
        <TeraKontur className="pointer-events-none absolute -right-24 -top-28 h-[26rem] w-[26rem] text-putih opacity-[0.11]" />
        <IsiSidebar
          pathname={pathname}
          itemsUtama={itemsUtama}
          itemsAdmin={itemsAdmin}
          tampilAdmin={tampilAdmin}
          nama={nama}
          peran={peran}
          onKeluar={onKeluar}
          padat={!terbuka}
          kontrol={
            <button
              type="button"
              onClick={onToggle}
              aria-label={terbuka ? "Tutup sidebar" : "Buka sidebar"}
              aria-expanded={terbuka}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-kendali border border-putih/20 bg-putih/8 text-putih/70 transition-colors hover:bg-putih/15 hover:text-putih"
            >
              {terbuka ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
          }
        />
      </aside>

      {/* Tirai laci ponsel — mengkliknya juga menutup. */}
      <div
        onClick={onTutupLaci}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-tinta/50 transition-opacity duration-300 motion-reduce:transition-none lg:hidden",
          laciTerbuka ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        ref={laciRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
        inert={!laciTerbuka || undefined}
        className={cn(
          "bukram fixed inset-y-0 left-0 z-50 flex w-72 max-w-[84vw] flex-col overflow-y-auto overflow-x-hidden text-putih/70 scroll-halus outline-none transition-transform duration-300 ease-out motion-reduce:transition-none lg:hidden",
          laciTerbuka ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <TeraKontur className="pointer-events-none absolute -right-24 -top-28 h-[26rem] w-[26rem] text-putih opacity-[0.11]" />
        <IsiSidebar
          pathname={pathname}
          itemsUtama={itemsUtama}
          itemsAdmin={itemsAdmin}
          tampilAdmin={tampilAdmin}
          nama={nama}
          peran={peran}
          onKeluar={onKeluar}
          padat={false}
          kontrol={
            <button
              type="button"
              onClick={onTutupLaci}
              aria-label="Tutup menu"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-kendali border border-putih/20 bg-putih/8 text-putih/70 transition-colors hover:bg-putih/15 hover:text-putih"
            >
              <X className="h-4 w-4" />
            </button>
          }
        />
      </aside>
    </>
  );
}

function inisial(nama: string): string {
  return nama
    .split(" ")
    .filter((k) => /^[A-Za-z]/.test(k))
    .slice(0, 2)
    .map((k) => k[0]!.toUpperCase())
    .join("");
}

function LogOutIkon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}

