"use client";

import { useState } from "react";
import { Check, Save } from "lucide-react";
import type { User } from "@/core/domain/user";
import { validasiKontak } from "@/core/usecase/profil";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useSession } from "@/providers/session";

/**
 * Perbaikan kontak oleh pemilik akun sendiri: nomor telepon dan alamat tempat
 * tinggal. Hanya dua field ini yang dapat diurus sendiri — nama, NIP/NIK,
 * jabatan, dan unit kerja tetap milik berkas kepegawaian desa (lihat kartu
 * "Perubahan data kepegawaian" di halaman ini).
 */
export function FormKontak({ user }: { user: User }) {
  const { gateways, segarkan } = useSession();
  const [form, setForm] = useState({
    phoneNumber: user.official.phoneNumber,
    address: user.official.address,
  });
  const [galat, setGalat] = useState<string[]>([]);
  const [berhasil, setBerhasil] = useState(false);
  const [proses, setProses] = useState(false);

  function ubah(kunci: keyof typeof form, nilai: string) {
    setForm((lama) => ({ ...lama, [kunci]: nilai }));
    setBerhasil(false);
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const periksa = validasiKontak(form);
    if (!periksa.sah) {
      setGalat([...periksa.galat]);
      return;
    }
    setGalat([]);
    setProses(true);
    try {
      await gateways.profil.perbaruiKontak(form);
      // Nilai resmi selalu dibaca ulang dari server, bukan disimpan di peramban.
      await segarkan();
      setBerhasil(true);
    } catch (err) {
      setGalat([err instanceof Error ? err.message : "Perubahan kontak gagal disimpan."]);
    } finally {
      setProses(false);
    }
  }

  return (
    <form onSubmit={kirim} className="space-y-4 p-4" noValidate>
      <Field label="Nomor telepon" hint="9–15 angka; boleh ditulis dengan tanda hubung">
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
          Kontak tersimpan.
        </p>
      ) : null}

      <Button type="submit" className="gap-2" disabled={proses}>
        <Save className="h-4 w-4" />
        {proses ? "Menyimpan…" : "Simpan kontak"}
      </Button>
    </form>
  );
}
