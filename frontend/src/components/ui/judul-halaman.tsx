import { cn } from "@/lib/cn";

/**
 * Kepala halaman. Struktur tetap: batang emas foil pendek, label arsip
 * (opsional) sebagai penanda bidang, judul serif besar, dan sub. Ukuran judul
 * dinaikkan dan jaraknya dirapatkan supaya hierarki halaman benar-benar
 * terbaca — sebelumnya hampir semua teks berukuran 13–15 px.
 */
export function JudulHalaman({
  judul,
  kode,
  sub,
  aksi,
  className,
}: {
  judul: string;
  /** Penanda bidang, mis. "Presensi & kehadiran". Ditulis kapital oleh CSS. */
  kode?: string;
  sub?: string;
  aksi?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="garis-foil h-[3px] w-9 rounded-full" />
          {kode ? <p className="label-arsip text-tinta-2">{kode}</p> : null}
        </div>
        <h1 className="mt-2.5 font-display text-[26px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[30px]">
          {judul}
        </h1>
        {sub ? (
          <p className="mt-1.5 text-[13.5px] font-medium leading-6 text-tinta-2">{sub}</p>
        ) : null}
      </div>
      {aksi}
    </div>
  );
}

