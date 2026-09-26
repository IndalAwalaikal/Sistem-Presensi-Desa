import { Camera, MapPin, ScanFace, ShieldCheck } from "lucide-react";

/**
 * Empat lapis pemeriksaan. Urutannya mengikuti urutan pemeriksaan yang benar
 * di dalam sistem, jadi penomoran di sini menyimpan informasi.
 */
const LAPISAN = [
  { ikon: ScanFace, teks: "Verifikasi wajah" },
  { ikon: Camera, teks: "Pemeriksaan tekstur gambar" },
  { ikon: MapPin, teks: "GPS & geofence kantor" },
  { ikon: ShieldCheck, teks: "Waktu server & jadwal" },
];

/**
 * Halaman kiri register: foto Kantor Desa Anabanua sebagai halaman gambar,
 * tanpa cap atau tanda air. Bila berkas foto belum tersedia, panel tetap rapi
 * karena latarnya hijau sampul.
 */
export function PanelIdentitas() {
  return (
    <section className="punggung relative hidden overflow-hidden bg-sampul text-putih lg:flex lg:flex-col">
      <div
        aria-hidden
        className="absolute inset-0 bg-[url('/kantor-desa-anabanua.jpg')] bg-cover bg-center"
      />
      {/* Lapisan keterbacaan: rata ke bawah agar teks tahan di atas foto */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-sampul via-sampul/88 to-sampul/25"
      />
      <div aria-hidden className="absolute inset-0 bg-sampul/20" />

      <div className="relative z-10 flex h-full flex-col px-11 py-12">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="garis-foil h-[3px] w-9 rounded-full" />
          <p className="label-arsip text-putih/75">
            Pemerintah Desa Anabanua · Kab. Barru
          </p>
        </div>

        <h1 className="mt-6 max-w-md font-display text-[42px] font-bold leading-[1.06] tracking-[-0.025em] [text-shadow:0_1px_14px_rgba(0,0,0,0.4)]">
          Presensi Perangkat Desa.
        </h1>
        <p className="mt-5 max-w-md text-[14.5px] leading-7 text-putih/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">
          Kehadiran yang terukur dan terdokumentasi — diverifikasi berlapis
          sebelum dicatat dengan waktu resmi server.
        </p>

        <ol className="mt-9 space-y-4 border-t border-putih/20 pt-8">
          {LAPISAN.map(({ ikon: Ikon, teks }, i) => (
            <li key={teks} className="flex items-center gap-3.5 text-[13.5px] text-putih/85">
              <span className="angka-ukur flex h-8 w-8 shrink-0 items-center justify-center rounded-tanda border border-putih/25 bg-sampul/60 text-[11px] font-semibold text-emas-terang backdrop-blur-sm">
                {i + 1}
              </span>
              <Ikon className="h-[17px] w-[17px] shrink-0 text-putih/70" strokeWidth={1.75} />
              {teks}
            </li>
          ))}
        </ol>

        <div className="mt-auto pt-9">
          <p className="inline-flex items-center gap-2 rounded-tanda border border-putih/25 bg-sampul/70 px-3 py-1.5 backdrop-blur-sm">
            <MapPin className="h-3.5 w-3.5 text-emas-terang" />
            <span className="label-arsip text-putih/85">
              Kantor Desa Anabanua · Kec. Barru
            </span>
          </p>
          <p className="label-arsip mt-3 text-putih/50">
            Tanpa mesin fingerprint · Tanpa E-KTP · Cukup kamera &amp; GPS
          </p>
        </div>
      </div>
    </section>
  );
}
