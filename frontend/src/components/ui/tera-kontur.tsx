import { cn } from "@/lib/cn";

/**
 * Tera kontur — cetakan garis kontur seperti pada kertas berharga dan sampul
 * buku register desa. Hanya dipakai di bidang sampul (cover) sebagai tekstur
 * latar; tidak pernah di atas kertas isi.
 *
 * Diwarnai mengikuti `currentColor`; pemanggil mengatur nada dan opasitas.
 */
export function TeraKontur({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={cn("pointer-events-none select-none", className)}
    >
      <g stroke="currentColor" fill="none" strokeWidth="0.9">
        {Array.from({ length: 17 }, (_, i) => {
          const t = i / 16;
          return (
            <ellipse
              key={i}
              cx={486 - t * 96}
              cy={78 + t * 104}
              rx={372 - t * 300}
              ry={330 - t * 262}
              opacity={0.28 + t * 0.72}
            />
          );
        })}
      </g>

      {/* Busur pemecah simetri, seperti lempengan cetak yang digeser */}
      <g stroke="currentColor" fill="none" strokeWidth="0.9" opacity="0.55">
        <path d="M -20 470 C 140 400 300 470 620 386" />
        <path d="M -20 508 C 140 438 300 508 620 424" />
        <path d="M -20 546 C 140 476 300 546 620 462" />
      </g>
    </svg>
  );
}
