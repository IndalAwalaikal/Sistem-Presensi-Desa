"use client";

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { PANJANG_SANDI_MIN } from "@/core/usecase/akun";
import { validasiUbahSandi } from "@/core/usecase/profil";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useSession } from "@/providers/session";

const KOSONG = { sandiLama: "", sandiBaru: "", konfirmasi: "" };

/**
 * Ganti kata sandi oleh pemiliknya sendiri. Sandi lama wajib disebut sebagai
 * bukti, dan sandi baru tidak pernah disimpan di peramban maupun dicatat di
 * jejak audit — pengelola akun pun tidak punya cara mengetahui sandi siapa pun
 * (reset akun hanya menerbitkan kode undangan baru).
 */
export function FormSandi() {
  const { gateways } = useSession();
  const [form, setForm] = useState(KOSONG);
  const [galat, setGalat] = useState<string[]>([]);
  const [berhasil, setBerhasil] = useState(false);
  const [proses, setProses] = useState(false);

  function ubah(kunci: keyof typeof KOSONG, nilai: string) {
    setForm((lama) => ({ ...lama, [kunci]: nilai }));
    setBerhasil(false);
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const periksa = validasiUbahSandi(form);
    if (!periksa.sah) {
      setGalat([...periksa.galat]);
      return;
    }
    setGalat([]);
    setProses(true);
    try {
      await gateways.profil.ubahSandi({ sandiLama: form.sandiLama, sandiBaru: form.sandiBaru });
      setForm(KOSONG);
      setBerhasil(true);
    } catch (err) {
      setGalat([err instanceof Error ? err.message : "Kata sandi gagal diubah."]);
    } finally {
      setProses(false);
    }
  }

  return (
    <form onSubmit={kirim} className="space-y-4 p-4" noValidate>
      <Field label="Kata sandi lama">
        <Input
          type="password"
          autoComplete="current-password"
          value={form.sandiLama}
          onChange={(e) => ubah("sandiLama", e.target.value)}
          placeholder="••••••••"
          required
        />
      </Field>
      <Field
        label="Kata sandi baru"
        hint={`Minimal ${PANJANG_SANDI_MIN} karakter dan memuat huruf serta angka`}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={form.sandiBaru}
          onChange={(e) => ubah("sandiBaru", e.target.value)}
          placeholder="••••••••"
          required
        />
      </Field>
      <Field label="Ulangi kata sandi baru">
        <Input
          type="password"
          autoComplete="new-password"
          value={form.konfirmasi}
          onChange={(e) => ubah("konfirmasi", e.target.value)}
          placeholder="••••••••"
          required
        />
      </Field>

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

      {berhasil ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-slip border border-primer/30 bg-primer/8 px-3.5 py-2.5 text-[13px] font-medium text-primer"
        >
          <Check className="h-4 w-4" />
          Kata sandi diganti. Gunakan sandi baru saat masuk berikutnya.
        </p>
      ) : null}

      <Button type="submit" variasi="sekunder" className="gap-2" disabled={proses}>
        <KeyRound className="h-4 w-4" />
        {proses ? "Mengganti…" : "Ganti kata sandi"}
      </Button>
    </form>
  );
}
