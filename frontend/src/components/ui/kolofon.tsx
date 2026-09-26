import { cn } from "@/lib/cn";

/**
 * Satu-satunya sumber kredit pembuat sistem. Dipakai di kolofon sidebar, kaki
 * lembar aplikasi, halaman depan, halaman masuk, dan metadata dokumen. Bila
 * nama tim/program berubah, ubah di satu tempat ini saja.
 *
 * Kredit sengaja hanya muncul sebagai catatan kecil di kaki (footer) setiap
 * halaman — tidak ada cap, lencana, logo, atau tanda air di badan halaman.
 */
export const KREDIT = {
  tim: "Tim Lentera Anabanua",
  program: "KKN-PPL Universitas Negeri Makassar",
  angkatan: "Angkatan XXXIII",
} as const;

/** Kredit lengkap satu baris — untuk kolofon ringkas dan metadata dokumen. */
export const KREDIT_LENGKAP = `${KREDIT.tim} — ${KREDIT.program} ${KREDIT.angkatan}`;

/**
 * Kolofon — catatan pembuat, diletakkan seperti colophon pada terbitan resmi:
 * di kaki halaman atau di dasar panel, bukan sebagai lencana melayang di badan
 * halaman.
 *
 * `nada="sampul"` dipakai di atas bidang hijau gelap, `nada="lembar"` di atas
 * kertas. `ringkas` menyisakan baris pertama saja.
 */
export function Kolofon({
  nada = "lembar",
  ringkas = false,
  className,
}: {
  nada?: "lembar" | "sampul";
  ringkas?: boolean;
  className?: string;
}) {
  const diSampul = nada === "sampul";

  return (
    <div className={cn("min-w-0", className)}>
      <span
        aria-hidden
        className={cn(
          "mb-2 block h-px w-10 rounded-full",
          diSampul ? "bg-emas/70" : "garis-foil",
        )}
      />
      <p
        className={cn(
          "label-arsip",
          diSampul ? "text-putih/45" : "text-tinta/40",
        )}
      >
        Dibuat oleh
      </p>
      <p
        className={cn(
          "mt-1 text-[12.5px] font-semibold leading-snug",
          diSampul ? "text-putih/90" : "text-tinta/80",
        )}
      >
        {KREDIT.tim}
      </p>
      {ringkas ? null : (
        <>
          <p
            className={cn(
              "mt-0.5 text-[11.5px] leading-snug",
              diSampul ? "text-putih/55" : "text-tinta/50",
            )}
          >
            {KREDIT.program}
          </p>
          <p
            className={cn(
              "angka-ukur mt-1 text-[10.5px]",
              diSampul ? "text-putih/45" : "text-tinta/45",
            )}
          >
            {KREDIT.angkatan}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Kolofon satu baris — bentuk kredit di kaki halaman: kaki sampul hijau
 * (`nada="sampul"`) dan kaki lembar aplikasi/halaman masuk (`nada="lembar"`).
 * Sengaja kecil, mono, dan redup supaya terbaca sebagai catatan kaki, bukan
 * sebagai lencana.
 */
export function KolofonBaris({
  nada = "lembar",
  className,
}: {
  nada?: "lembar" | "sampul";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "label-arsip flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center",
        nada === "sampul" ? "text-putih/45" : "text-tinta/40",
        className,
      )}
    >
      <span
        className={cn("h-1 w-1 rounded-full", nada === "sampul" ? "bg-emas-terang" : "bg-emas")}
        aria-hidden
      />
      {KREDIT.tim}
      <span
        className={cn("h-1 w-1 rounded-full", nada === "sampul" ? "bg-emas-terang" : "bg-emas")}
        aria-hidden
      />
      {KREDIT.program} {KREDIT.angkatan}
    </p>
  );
}
