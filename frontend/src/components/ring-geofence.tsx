import { cn } from "@/lib/cn";

/**
 * Ring Geofence — radar konsentris yang menampilkan posisi Anda terhadap
 * kantor desa: jarak, radius geofence, dan akurasi GPS perangkat.
 */
export function RingGeofence({
  jarak,
  radius,
  akurasi,
  status,
  namaKantor = "Kantor Desa",
  className,
}: {
  /** Jarak Anda dari kantor (meter). */
  jarak: number | null;
  /** Radius geofence kantor (meter). */
  radius: number;
  /** Akurasi GPS perangkat (meter). */
  akurasi: number | null;
  status: "DALAM" | "LUAR" | "AKURASI_RENDAH" | "TANPA_LOKASI";
  namaKantor?: string;
  className?: string;
}) {
  const S = 260;
  const c = S / 2;
  const jarakTampil = jarak ?? 0;
  // Radar menampilkan hingga 1.6× radius geofence.
  const skalaPx = (radius * 1.6) / (S / 2 - 28); // meter per piksel
  const radiusPx = radius / skalaPx;
  const userPx = Math.min(S / 2 - 24, jarakTampil / skalaPx);
  // Arah tetap: timur laut (45°).
  const ux = c + userPx * Math.SQRT1_2;
  const uy = c - userPx * Math.SQRT1_2;

  const warna =
    status === "DALAM"
      ? {
          garis: "var(--ds-primer)",
          isi: "rgba(23, 122, 69, 0.07)",
          titik: "var(--ds-primer)",
        }
      : status === "LUAR"
        ? {
            garis: "var(--ds-bahaya)",
            isi: "rgba(179, 53, 44, 0.06)",
            titik: "var(--ds-bahaya)",
          }
        : {
            garis: "var(--ds-peringatan)",
            isi: "rgba(150, 101, 15, 0.07)",
            titik: "var(--ds-peringatan)",
          };

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        role="img"
        aria-label={`Jarak ${jarak === null ? "tidak diketahui" : `${Math.round(jarak)} meter`} dari ${namaKantor}`}
        className="h-auto w-full max-w-[280px]"
      >
        {/* Kisi radar */}
        <g stroke="var(--ds-garis)" strokeWidth="1">
          <line x1={c} y1="12" x2={c} y2={S - 12} strokeDasharray="3 6" />
          <line x1="12" y1={c} x2={S - 12} y2={c} strokeDasharray="3 6" />
        </g>

        {/* Area geofence kantor */}
        <circle cx={c} cy={c} r={radiusPx} fill={warna.isi} stroke={warna.garis} strokeWidth="1.5" />
        <circle cx={c} cy={c} r="5" fill={warna.titik} />
        <text
          x={c}
          y={c + radiusPx + 16}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--ds-tinta)"
          fontFamily="var(--font-mono), monospace"
          fontWeight="500"
        >
          {namaKantor} · {radius} m
        </text>

        {/* Titik pengguna + garis jarak */}
        {status !== "TANPA_LOKASI" && (
          <>
            <line x1={c} y1={c} x2={ux} y2={uy} stroke={warna.garis} strokeWidth="1.5" strokeDasharray="4 3" />
            {status === "DALAM" && (
              <circle cx={ux} cy={uy} r="14" fill="none" stroke={warna.garis} strokeWidth="1.5" className="ring-denyut" style={{ transformOrigin: `${ux}px ${uy}px` }} />
            )}
            <circle cx={ux} cy={uy} r="6.5" fill={warna.titik} stroke="var(--ds-putih)" strokeWidth="2" />
            <text
              x={ux + (ux >= c ? 10 : -10)}
              y={uy - 10}
              textAnchor={ux >= c ? "start" : "end"}
              fontSize="11"
              fill={warna.titik}
              fontWeight="600"
              fontFamily="var(--font-mono), monospace"
            >
              {Math.round(jarakTampil)} m
            </text>
          </>
        )}

        {/* Label akurasi di sudut */}
        <text
          x="14"
          y={S - 14}
          fontSize="10.5"
          fill={status === "TANPA_LOKASI" ? "var(--ds-peringatan)" : "var(--ds-info)"}
          fontFamily="var(--font-mono), monospace"
        >
          {akurasi === null ? "GPS —" : `±${Math.round(akurasi)} m`}
        </text>
      </svg>
      {/* Keterangan memakai tinta sekunder padat, bukan hitam yang diredupkan */}
      <p className="angka-ukur mt-2 text-center text-[11.5px] text-tinta-2">
        {status === "DALAM" && "Anda berada di dalam area kerja."}
        {status === "LUAR" && `Di luar area — mendekati ${namaKantor}.`}
        {status === "AKURASI_RENDAH" && "Sinyal GPS lemah — cari tempat terbuka."}
        {status === "TANPA_LOKASI" && "Lokasi belum terbaca."}
      </p>
    </div>
  );
}
