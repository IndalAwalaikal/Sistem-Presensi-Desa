"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fingerprint } from "lucide-react";
import {
  normalkanKode,
  pesanKodeTidakSah,
  samarkanEmail,
  sisaHariUndangan,
  type Undangan,
} from "@/core/domain/undangan";
import { PANJANG_SANDI_MIN, validasiAktivasiAkun } from "@/core/usecase/akun";
import { TautanTombol, Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useSession } from "@/providers/session";
import { masaBerlaku } from "@/features/akun/use-salin";

const KOSONG = { password: "", konfirmasi: "", phoneNumber: "", address: "" };

/**
 * Aktivasi akun lewat kode undangan sekali pakai: pengguna menetapkan kata
 * sandinya sendiri (pengelola akun tidak pernah tahu sandi siapa pun),
 * melengkapi data yang boleh diisi sendiri, dan mencatat persetujuan pemrosesan
 * data wajah sebelum pendaftaran biometrik dimulai (dokumen §6 dan §19).
 */
export function FormAktivasi() {
  const { gateways, segarkan } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const kode = normalkanKode(params.get("kode") ?? "");

  /** undefined = sedang memeriksa; null = kode tidak dikenal. */
  const [undangan, setUndangan] = useState<Undangan | null | undefined>(undefined);
  const [alasan, setAlasan] = useState<string | null>(null);
  const [form, setForm] = useState(KOSONG);
  const [consent, setConsent] = useState(false);
  const [galat, setGalat] = useState<string[]>([]);
  const [proses, setProses] = useState(false);

  useEffect(() => {
    if (!kode) return;
    let dibatalkan = false;
    gateways.auth
      .getUndangan(kode)
      .then((hasil) => {
        if (dibatalkan) return;
        setUndangan(hasil);
        setAlasan(pesanKodeTidakSah(hasil));
      })
      .catch(() => {
        if (dibatalkan) return;
        setUndangan(null);
        setAlasan("Kode aktivasi tidak dapat diperiksa sekarang. Coba lagi sebentar lagi.");
      });
    return () => {
      dibatalkan = true;
    };
  }, [kode, gateways]);

  function ubah(kunci: keyof typeof KOSONG, nilai: string) {
    setForm((lama) => ({ ...lama, [kunci]: nilai }));
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const periksa = validasiAktivasiAkun({ ...form, consentBiometrik: consent });
    if (!periksa.sah) {
      setGalat([...periksa.galat]);
      return;
    }
    setGalat([]);
    setProses(true);
    try {
      await gateways.auth.aktifkan(kode, {
        password: form.password,
        phoneNumber: form.phoneNumber,
        address: form.address,
        consentBiometrik: consent,
      });
      // Sesi sudah terbuka dari aktivasi; lanjut ke pendaftaran wajah.
      await segarkan();
      router.replace("/enrollment");
    } catch (err) {
      setGalat([err instanceof Error ? err.message : "Aktivasi gagal."]);
    } finally {
      setProses(false);
    }
  }

  if (!kode) {
    // Tautan tanpa kode tidak perlu diperiksa ke mana pun — langsung dijelaskan.
    return (
      <KodeTidakSah pesan="Tautan aktivasi tidak memuat kode. Minta tautan lengkap kepada sekretaris desa." />
    );
  }

  if (undangan === undefined) {
    return <p className="label-arsip text-tinta/45">Memeriksa kode aktivasi…</p>;
  }

  if (!undangan || alasan) {
    return <KodeTidakSah pesan={alasan ?? "Kode aktivasi tidak dapat dipakai."} />;
  }

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="garis-foil h-[3px] w-9 rounded-full" />
        <p className="label-arsip text-tinta/45">Aktivasi akun</p>
      </div>
      <h2 className="mt-3 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em]">
        Tetapkan kata sandi &amp; lengkapi data
      </h2>
      <p className="mt-2.5 text-[14px] leading-6 text-tinta/60">
        Undangan untuk <strong className="font-semibold">{undangan.nama}</strong>{" "}
        ({samarkanEmail(undangan.email)}). Kode {masaBerlaku(sisaHariUndangan(undangan))}.
      </p>

      <form onSubmit={kirim} className="mt-6 space-y-4" noValidate>
        <Field
          label="Kata sandi"
          hint={`Minimal ${PANJANG_SANDI_MIN} karakter dan memuat huruf serta angka`}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => ubah("password", e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <Field label="Ulangi kata sandi">
          <Input
            type="password"
            autoComplete="new-password"
            value={form.konfirmasi}
            onChange={(e) => ubah("konfirmasi", e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <Field label="Nomor telepon">
          <Input
            value={form.phoneNumber}
            onChange={(e) => ubah("phoneNumber", e.target.value)}
            placeholder="0852-xxxx-xxxx"
            className="angka-ukur"
            required
          />
        </Field>
        <Field label="Alamat tempat tinggal">
          <Input
            value={form.address}
            onChange={(e) => ubah("address", e.target.value)}
            placeholder="Desa Anabanua, Kec. Barru"
            required
          />
        </Field>

        <label className="flex gap-3 rounded-slip border border-garis-folio bg-folio-2/60 px-3.5 py-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primer"
          />
          <span className="text-[12.5px] leading-6 text-tinta/65">
            Saya menyetujui pemrosesan data wajah saya untuk memverifikasi
            identitas saat presensi. Data disimpan sebagai templat biometrik
            (bukan foto mentah) dan dihapus ketika akun tidak lagi aktif.
          </span>
        </label>

        {galat.length > 0 ? (
          <ul
            role="alert"
            className="space-y-1 rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] font-medium text-bahaya"
          >
            {galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        ) : null}

        <Button type="submit" className="w-full gap-2" disabled={proses}>
          <Fingerprint className="h-4 w-4" />
          {proses ? "Mengaktifkan…" : "Aktifkan akun & lanjut daftarkan wajah"}
        </Button>
      </form>
    </>
  );
/** Penutup ketika kode undangan tidak dapat dipakai. */
function KodeTidakSah({ pesan }: { pesan: string }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="garis-foil h-[3px] w-9 rounded-full" />
        <p className="label-arsip text-tinta/45">Aktivasi akun</p>
      </div>
      <h2 className="mt-3 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em]">
        Kode aktivasi tidak dapat dipakai
      </h2>
      <p
        role="alert"
        className="mt-4 rounded-slip border border-peringatan/35 bg-peringatan/8 px-3.5 py-3 text-[13px] leading-6 text-peringatan"
      >
        {pesan}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <TautanTombol href="/login" variasi="sekunder">
          Ke halaman masuk
        </TautanTombol>
      </div>
    </>
  );
}
}