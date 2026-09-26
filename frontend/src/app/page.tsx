"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Fingerprint, LayoutDashboard, MapPin } from "lucide-react";
import { useSession } from "@/providers/session";
import { Logo } from "@/components/ui/logo";
import { KolofonBaris } from "@/components/ui/kolofon";
import { TeraKontur } from "@/components/ui/tera-kontur";

const LAPISAN = [
  "Verifikasi wajah",
  "Deteksi keaslian (liveness)",
  "GPS & geofence kantor",
  "Waktu server & jadwal",
];

/**
 * Halaman depan: sampul register. Dua pintu masuk, dan ringkasan lapis
 * pemeriksaan yang dijalankan sistem. Kredit pembuat dicantumkan secukupnya di
 * kaki halaman — bukan sebagai cap besar di badan sampul.
 */
export default function HalamanDepan() {
  const { gateways } = useSession();
  const router = useRouter();
  const [memeriksa, setMemeriksa] = useState(false);

  async function bukaPresensi() {
    setMemeriksa(true);
    // Maksud "lanjut ke presensi" disimpan ganda: query param + sessionStorage,
    // agar tidak hilang di jalur navigasi mana pun.
    const simpanMaksud = () => {
      try {
        window.sessionStorage.setItem("presensi-lanjut", "/presensi");
      } catch {
        // sessionStorage tidak tersedia — param query tetap dibawa.
      }
    };
    try {
      const user = await gateways.auth.getCurrentUser();
      if (user) {
        router.replace("/presensi");
        return;
      }
      simpanMaksud();
      router.replace("/login?lanjut=%2Fpresensi");
    } catch {
      simpanMaksud();
      router.replace("/login?lanjut=%2Fpresensi");
    }
  }

  return (
    <div className="bukram relative flex min-h-dvh flex-col overflow-hidden">
      {/* Foto halaman depan sebagai tekstur sampul (fallback: hijau polos).
          Duotone hijau lewat mix-blend, jadi foto tidak lagi jadi latar biasa. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[url('/background-depan.png')] bg-cover bg-center opacity-30 mix-blend-luminosity"
      />
      <TeraKontur className="absolute -right-52 -top-56 h-[52rem] w-[52rem] text-putih opacity-[0.1]" />
      <TeraKontur className="absolute -bottom-64 -left-40 h-[44rem] w-[44rem] text-putih opacity-[0.07]" />

      <header className="relative z-10 px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Logo ukuran="sm" />
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold leading-tight text-putih">
              Presensi Anabanua
            </p>
            <p className="label-arsip mt-0.5 text-putih/50">
              Pemerintah Desa Anabanua
            </p>
          </div>
          <p className="label-arsip ml-auto hidden items-center gap-2 text-putih/55 sm:flex">
            <MapPin className="h-3.5 w-3.5 text-emas-terang" />
            Kab. Barru · Sulawesi Selatan
          </p>
        </div>
        <span aria-hidden className="garis-foil mx-auto mt-5 block h-px max-w-6xl opacity-50" />
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="garis-foil h-[3px] w-9 rounded-full" />
            <p className="label-arsip text-putih/70">
              Presensi & monitoring kedisiplinan
            </p>
          </div>

          <h1 className="mt-5 font-display text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-putih sm:text-[46px]">
            Presensi Perangkat Desa.
          </h1>
          <p className="mt-4 max-w-lg text-[14.5px] leading-7 text-putih/75">
            Pilih kebutuhan Anda. Presensi memverifikasi wajah, keaslian, dan
            lokasi sebelum dicatat dengan waktu resmi server.
          </p>

          {/*
           * Dua pintu dibedakan oleh bahannya, bukan hanya oleh warna: pintu
           * presensi adalah secarik kertas dengan punggung emas foil, pintu
           * dashboard tetap menjadi bagian dari sampul.
           */}
          <div className="mt-9 space-y-3.5">
            <button
              type="button"
              onClick={() => void bukaPresensi()}
              disabled={memeriksa}
              className="slip group relative flex w-full items-center gap-4 overflow-hidden px-5 py-4 text-left transition-shadow hover:shadow-lembar disabled:opacity-70"
            >
              <span aria-hidden className="garis-foil absolute inset-y-0 left-0 w-[3px]" />
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-kendali border border-primer/25 bg-primer/8 text-primer">
                <Fingerprint className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[17.5px] font-bold tracking-[-0.015em] text-tinta">
                  Presensi
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-5 text-tinta/60">
                  {memeriksa
                    ? "Memeriksa sesi…"
                    : "Check-in / check-out hari ini — kamera & GPS"}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-primer transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="group flex w-full items-center gap-4 rounded-lembar border border-putih/20 bg-putih/6 px-5 py-4 text-left backdrop-blur-sm transition-colors hover:border-putih/35 hover:bg-putih/10"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-kendali border border-putih/25 text-putih/85">
                <LayoutDashboard className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[17.5px] font-bold tracking-[-0.015em] text-putih">
                  Masuk ke Dashboard
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-5 text-putih/60">
                  Monitoring, persetujuan, laporan — perlu masuk akun
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-putih/45 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* Lembar ringkas: lapis pemeriksaan yang dijalankan setiap presensi. */}
        <aside className="folio px-6 py-8 sm:px-9">
          <span aria-hidden className="garis-foil absolute inset-x-0 top-0 h-[3px]" />
          <p className="label-arsip text-tinta/45">Yang diverifikasi setiap presensi</p>
          <ol className="mt-4 space-y-3">
            {LAPISAN.map((t, i) => (
              <li key={t} className="flex items-center gap-3 text-[13px] text-tinta/75">
                <span className="angka-ukur flex h-5 w-5 shrink-0 items-center justify-center rounded-tanda bg-primer/10 text-[10.5px] font-semibold text-primer">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>

          <p className="label-arsip mt-7 border-t border-garis-folio pt-4 text-tinta/45">
            Tanpa mesin fingerprint · Tanpa E-KTP · Cukup kamera &amp; GPS
          </p>
        </aside>
      </main>

      <footer className="relative z-10 px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-putih/15 pt-5">
          {/* Kredit pembuat sistem — satu baris redup di kaki halaman. */}
          <KolofonBaris nada="sampul" />
          <p className="label-arsip text-putih/40">
            Waktu resmi WITA (Asia/Makassar)
          </p>
        </div>
      </footer>
    </div>
  );
}
