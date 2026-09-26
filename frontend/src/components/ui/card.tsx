import { cn } from "@/lib/cn";

/**
 * Slip — kartu sebagai secarik kertas di atas lembar: sisi atas memantulkan
 * cahaya, tepi bawah punya garis potong kertas, dan bayangannya bertumpuk.
 * Ketebalannya datang dari kelas `.slip` di globals.css, bukan dari satu
 * utilitas shadow tipis.
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("slip", className)}>{children}</div>;
}

/**
 * Kepala berkas — pita judul slip. Sisi atas saja yang melengkung supaya
 * terbaca sebagai tab yang menempel pada lembar, dan garis emas foil tipis
 * memisahkannya dari isi.
 */
export function CardHeader({
  title,
  sub,
  aksi,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  aksi?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("kepala-berkas px-4 pb-3 pt-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-bold leading-snug tracking-[-0.01em]">
            {title}
          </h2>
          {sub ? (
            <p className="mt-0.5 text-[12.5px] font-medium leading-relaxed text-tinta-2">{sub}</p>
          ) : null}
        </div>
        {aksi}
      </div>
      <span aria-hidden className="garis-kepala mt-3 block" />
    </div>
  );
}

