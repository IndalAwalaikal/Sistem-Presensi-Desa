"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { TeraKontur } from "@/components/ui/tera-kontur";
import type { ItemNav } from "@/features/navigasi/daftar-nav";

/**
 * Navigasi bawah — tepi bawah sampul register. Item aktif menjadi tab kertas
 * yang menempel pada sampul gelap; hanya sudut tab itu yang melengkung, jadi
 * bentuknya menandai keadaan, bukan sekadar hiasan.
 */
export function NavBawah({
  items,
  pathname,
}: {
  items: ItemNav[];
  pathname: string;
}) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-3 bottom-3 z-30 lg:hidden"
    >
      <div className="bukram overflow-hidden rounded-lembar p-1.5">
        <TeraKontur className="absolute -bottom-24 -left-16 h-56 w-56 text-putih opacity-[0.1]" />
        <ul className="relative z-10 grid grid-cols-5 gap-1">
          {items.map((item) => {
            const aktif = pathname === item.href;
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={aktif ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-kendali px-1 py-2 transition-colors",
                    aktif
                      ? "bg-folio text-primer shadow-slip"
                      : "text-putih/85 hover:bg-putih/12 hover:text-putih",
                  )}
                >
                  <item.ikon className="h-5 w-5" strokeWidth={aktif ? 2.1 : 1.75} />
                  <span className="w-full truncate text-center text-[10px] font-medium leading-none tracking-[0.02em]">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

