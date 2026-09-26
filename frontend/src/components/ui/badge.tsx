import { cn } from "@/lib/cn";

type Nada = "primer" | "bahaya" | "peringatan" | "info" | "netral" | "putih";

const NADA: Record<Nada, string> = {
  primer: "border-primer/30 bg-primer/8 text-primer",
  bahaya: "border-bahaya/30 bg-bahaya/8 text-bahaya",
  peringatan: "border-peringatan/35 bg-peringatan/8 text-peringatan",
  info: "border-info/30 bg-info/8 text-info",
  netral: "border-garis bg-meja/60 text-tinta/60",
  putih: "border-garis bg-folio text-tinta",
};

/**
 * Label status bergaya arsip: mono, kapital, berjarak lebar — memakai kelas
 * label-arsip yang sama dengan seluruh penanda bidang lain, sehingga tidak lagi
 * ada sepuluh variasi ukuran huruf kecil yang berbeda.
 */
export function Badge({
  nada = "netral",
  className,
  children,
}: {
  nada?: Nada;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "label-arsip inline-flex shrink-0 items-center gap-1.5 rounded-tanda border px-2 py-1",
        NADA[nada],
        className,
      )}
    >
      {children}
    </span>
  );
}

