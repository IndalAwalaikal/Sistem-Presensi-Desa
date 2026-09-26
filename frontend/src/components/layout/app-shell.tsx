"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Menu } from "lucide-react";
import { useSession } from "@/providers/session";
import { isAdminRole, ROLE_LABEL } from "@/core/domain/user";
import { NAV_ADMIN, NAV_UTAMA } from "@/features/navigasi/daftar-nav";
import { SidebarDesktop } from "@/components/layout/sidebar-desktop";
import { NavBawah } from "@/components/layout/nav-bawah";
import { Logo } from "@/components/ui/logo";
import { KolofonBaris } from "@/components/ui/kolofon";
import { TeraKontur } from "@/components/ui/tera-kontur";
import { cn } from "@/lib/cn";

/** Preferensi lipat sidebar desktop disimpan agar diingat antar kunjungan. */
const KUNCI_SIDEBAR = "anabanua:sidebar-terbuka";

/**
 * Toko kecil untuk preferensi sidebar: localStorage sebagai sumber, langganan
 * dalam memori sebagai pemicu render ulang. `useSyncExternalStore` dipakai agar
 * server dan kunjungan pertama selalu bernilai "terbuka" (tanpa ketidakcocokan
 * hidrasi), lalu preferensi tersimpan menyusul tanpa setState di dalam effect.
 */
const pendengarSidebar = new Set<() => void>();

function berlanggananSidebar(fn: () => void): () => void {
  pendengarSidebar.add(fn);
  return () => pendengarSidebar.delete(fn);
}

function ambilSidebarTerbuka(): boolean {
  return localStorage.getItem(KUNCI_SIDEBAR) !== "0";
}

function simpanSidebarTerbuka(nilai: boolean): void {
  localStorage.setItem(KUNCI_SIDEBAR, nilai ? "1" : "0");
  for (const fn of pendengarSidebar) fn();
}

const SIDEBAR_AWAL = () => true;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, keluar } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  /** Desktop: sidebar penuh (true) atau rel ikon (false) — diingat antar kunjungan. */
  const terbuka = useSyncExternalStore(
    berlanggananSidebar,
    ambilSidebarTerbuka,
    SIDEBAR_AWAL,
  );

  /** Ponsel: laci navigasi di atas lembar. */
  const [laciTerbuka, setLaciTerbuka] = useState(false);
  const laciRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (user === null) router.replace("/login");
  }, [user, router]);

  const toggleSidebar = useCallback(() => {
    simpanSidebarTerbuka(!terbuka);
  }, [terbuka]);

  // Laci ponsel ditutup saat pindah halaman — disetel saat render (bukan di
  // effect) setiap kali rute berubah, termasuk navigasi maju/mundur peramban.
  const [pathnameLama, setPathnameLama] = useState(pathname);
  if (pathnameLama !== pathname) {
    setPathnameLama(pathname);
    setLaciTerbuka(false);
  }

  // Selama laci terbuka: Escape menutup, gulir latar dikunci, fokus pindah ke laci.
  useEffect(() => {
    if (!laciTerbuka) return;
    const gulirSemula = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLaciTerbuka(false);
    };
    window.addEventListener("keydown", onKey);
    laciRef.current?.focus();
    return () => {
      document.body.style.overflow = gulirSemula;
      window.removeEventListener("keydown", onKey);
    };
  }, [laciTerbuka]);

  if (user === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="label-arsip flex items-center gap-2 text-tinta/50">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
          Memuat lembar…
        </div>
      </div>
    );
  }

  if (user === null) return null;

  const admin = isAdminRole(user.role);

  return (
    <div
      className={cn(
        "min-h-dvh transition-[padding] duration-300 ease-out motion-reduce:transition-none",
        terbuka ? "lg:pl-64" : "lg:pl-[4.5rem]",
      )}
    >
      <SidebarDesktop
        pathname={pathname}
        itemsUtama={NAV_UTAMA}
        itemsAdmin={NAV_ADMIN}
        tampilAdmin={admin}
        nama={user.fullName}
        peran={ROLE_LABEL[user.role]}
        terbuka={terbuka}
        onToggle={toggleSidebar}
        laciTerbuka={laciTerbuka}
        onTutupLaci={() => setLaciTerbuka(false)}
        laciRef={laciRef}
        onKeluar={() => {
          void keluar();
          router.replace("/login");
        }}
      />

      {/* Pita sampul ponsel — melayang dengan sudut lembut, bukan bilah rata */}
      <header className="sticky top-0 z-30 px-3 pt-3 lg:hidden">
        <div className="bukram overflow-hidden rounded-lembar px-3.5 py-2.5 text-putih">
          <TeraKontur className="absolute -right-10 -top-14 h-48 w-48 text-putih opacity-[0.12]" />
          <div className="relative z-10 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLaciTerbuka(true)}
              aria-label="Buka menu navigasi"
              aria-expanded={laciTerbuka}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-kendali border border-putih/20 bg-putih/10 text-putih transition-colors hover:bg-putih/20"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo ukuran="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-tight tracking-[-0.01em]">
                Presensi Anabanua
              </p>
              <p className="truncate text-[11px] leading-tight text-putih/55">
                {user.fullName} · {ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 pb-28 pt-3 sm:px-4 lg:px-8 lg:pb-10 lg:pt-8">
        {/* Lembar isi — duduk di atas "meja", bukan menempel ke tepi jendela */}
        <div className="folio mx-auto w-full max-w-6xl overflow-hidden px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          <div className="lembar-mendarat">
            {children}

            {/* Kredit pembuat sistem — satu baris redup di kaki lembar. */}
            <footer className="mt-9 border-t border-garis-folio pt-5">
              <KolofonBaris />
            </footer>
          </div>
        </div>
      </main>

      <NavBawah items={NAV_UTAMA} pathname={pathname} />
    </div>
  );
}

