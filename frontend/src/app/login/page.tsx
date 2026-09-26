"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useSession } from "@/providers/session";
import { PanelIdentitas } from "@/features/auth/panel-identitas";
import { PanelAkunContoh } from "@/features/auth/panel-akun";
import { Logo } from "@/components/ui/logo";
import { KolofonBaris } from "@/components/ui/kolofon";
import { TeraKontur } from "@/components/ui/tera-kontur";

function FormulirLogin() {
  const { masuk } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [salah, setSalah] = useState<string | null>(null);
  const [proses, setProses] = useState(false);

  /**
   * Tujuan setelah masuk — tanpa state/effect agar bebas efek samping:
   * prioritas query ?lanjut=, lalu sessionStorage yang disimpan halaman
   * depan (bila query hilang di jalur navigasi), terakhir dashboard.
   */
  const tujuan =
    params.get("lanjut") ??
    (typeof window !== "undefined"
      ? window.sessionStorage.getItem("presensi-lanjut")
      : null) ??
    "/dashboard";

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSalah(null);
    setProses(true);
    try {
      await masuk(email, sandi);
      try {
        window.sessionStorage.removeItem("presensi-lanjut");
      } catch {
        // abaikan — pembersihan maksud bersifat best-effort
      }
      router.replace(tujuan);
    } catch (err) {
      setSalah(err instanceof Error ? err.message : "Masuk gagal.");
    } finally {
      setProses(false);
    }
  }

  const lanjutPresensi = tujuan === "/presensi";

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="garis-foil h-[3px] w-9 rounded-full" />
        <p className="label-arsip text-tinta/45">Masuk akun dinas</p>
      </div>
      <h2 className="mt-3 font-display text-[28px] font-bold leading-[1.12] tracking-[-0.025em]">
        Masuk ke akun Anda
      </h2>
      <p className="mt-2.5 text-[14px] leading-6 text-tinta/60">
        Gunakan email dinas yang diberikan sekretaris desa.
      </p>

      {lanjutPresensi ? (
        <p className="mt-5 inline-flex items-center gap-2 rounded-tanda border border-primer/30 bg-primer/8 px-2.5 py-1.5 text-[12px] font-semibold text-primer">
          <Fingerprint className="h-3.5 w-3.5" />
          Setelah masuk, Anda dilanjutkan ke halaman Presensi
        </p>
      ) : null}

      <form onSubmit={kirim} className="mt-7 space-y-5" noValidate>
        <Field label="Email dinas">
          <Input
            type="email"
            autoComplete="username"
            placeholder="nama@anabanua.id"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Kata sandi">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            required
          />
        </Field>

        {salah ? (
          <p
            role="alert"
            className="rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] font-medium text-bahaya"
          >
            {salah}
          </p>
        ) : null}

        <Button type="submit" className="w-full gap-2" disabled={proses}>
          {proses
            ? "Memeriksa…"
            : lanjutPresensi
              ? "Masuk & lanjut ke Presensi"
              : "Masuk"}
        </Button>
      </form>

      <PanelAkunContoh onPilih={setEmail} />

      <p className="mt-6 text-center text-[12.5px] leading-6 text-tinta/55">
        Menerima kode undangan dari sekretaris desa?{" "}
        <Link
          href="/aktivasi"
          className="font-semibold text-primer transition-colors hover:text-primer-terang"
        >
          Aktivasi akun
        </Link>
      </p>
    </>
  );
}

export default function HalamanLogin() {
  return (
    <div className="bukram relative flex min-h-dvh items-center justify-center overflow-hidden px-3 py-6 sm:px-6 lg:px-10 lg:py-12">
      {/* Cetakan kontur pada sampul — tekstur latar saja; tidak ada cap atau
          tanda air di badan halaman. */}
      <TeraKontur className="absolute -right-40 -top-40 h-[46rem] w-[46rem] text-putih opacity-[0.09]" />
      <TeraKontur className="absolute -bottom-56 -left-32 h-[40rem] w-[40rem] text-putih opacity-[0.07]" />

      {/* Satu lembar register terbuka: halaman gambar di kiri, halaman isian
          di kanan, dipisah punggung buku. */}
      <div className="folio lembar-mendarat relative z-10 grid w-full max-w-5xl overflow-hidden lg:grid-cols-[1.05fr_1fr]">
        <PanelIdentitas />

        <section className="punggung-luar relative flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-14 lg:py-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <Logo ukuran="lg" />
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-bold leading-tight">
                    Presensi Anabanua
                  </p>
                  <p className="label-arsip mt-0.5 text-tinta/45">
                    Pemerintah Desa Anabanua
                  </p>
                </div>
              </div>
              <Link
                href="/"
                className="label-arsip text-tinta/45 transition-colors hover:text-primer"
              >
                ← Halaman depan
              </Link>
            </div>

            <Suspense
              fallback={
                <p className="label-arsip text-tinta/45">Memuat formulir…</p>
              }
            >
              <FormulirLogin />
            </Suspense>

            {/* Kredit pembuat sistem — cukup satu baris redup di kaki lembar. */}
            <footer className="mt-10 border-t border-garis-folio pt-5">
              <KolofonBaris />
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
