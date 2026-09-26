import Image from "next/image";
import { cn } from "@/lib/cn";

type Ukuran = "sm" | "md" | "lg";

const KOTAK: Record<Ukuran, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-11 w-11",
};

/**
 * Logo Kabupaten Barru — emblem transparan langsung, tanpa latar kotak.
 * Dipakai sebagai brand mark di header, sidebar, dan halaman login.
 */
export function Logo({
  ukuran = "md",
  className,
}: {
  ukuran?: Ukuran;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        KOTAK[ukuran],
        className,
      )}
    >
      <Image
        src="/logo-barru.png"
        alt="Logo Kabupaten Barru"
        fill
        sizes="48px"
        priority
        className="object-contain"
      />
    </span>
  );
}
