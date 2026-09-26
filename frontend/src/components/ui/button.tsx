import Link from "next/link";
import { cn } from "@/lib/cn";

type Variasi = "utama" | "sekunder" | "bahaya" | "hantu" | "bahaya-tombol";

/**
 * Bentuk dasar kendali: radius 10 px (bukan satu radius untuk seluruh
 * aplikasi), tinggi 40 px, dan garis kilau tipis di sisi atas sehingga tombol
 * terbaca sebagai bidang yang menyala sedikit, bukan persegi rata.
 */
export const KENDALI =
  "inline-flex h-10 items-center justify-center gap-2 rounded-kendali px-4 text-[13.5px] font-semibold tracking-[0.01em] transition-colors";

const VARIASI: Record<Variasi, string> = {
  utama:
    "border border-primer-gelap/30 bg-primer text-putih shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-primer-terang active:bg-primer-gelap",
  sekunder:
    "border border-garis bg-folio text-tinta hover:border-tinta/25 hover:bg-folio-2 active:bg-folio-2",
  bahaya:
    "border border-bahaya/40 bg-bahaya text-putih shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] hover:opacity-90 active:opacity-80",
  hantu: "border border-transparent text-primer hover:bg-primer/8",
  "bahaya-tombol":
    "border border-bahaya/35 bg-folio text-bahaya hover:border-bahaya/60 hover:bg-bahaya/8",
};

export function Button({
  variasi = "utama",
  className,
  type = "button",
  disabled,
  onClick,
  children,
}: {
  variasi?: Variasi;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        KENDALI,
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIASI[variasi],
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Tautan yang berperilaku seperti tombol. Sebelumnya setiap halaman menulis
 * ulang kelas tombolnya sendiri sebagai <Link>, sehingga gaya tombol menyimpang
 * dari satu halaman ke halaman lain.
 */
export function TautanTombol({
  href,
  variasi = "utama",
  className,
  children,
}: {
  href: string;
  variasi?: Variasi;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(KENDALI, VARIASI[variasi], className)}>
      {children}
    </Link>
  );
}

