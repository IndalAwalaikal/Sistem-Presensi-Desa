"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import {
  REQUEST_TYPES,
  REQUEST_TYPE_LABEL,
  type RequestType,
} from "@/core/domain/requests";
import { ROLE_LABEL, type User } from "@/core/domain/user";
import type { CreateMassalCommand } from "@/core/ports/gateways";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { tanggalISO } from "@/lib/waktu";

/**
 * Formulir pengajuan massal (mis. cuti bersama): satu kiriman yang sama untuk
 * banyak perangkat sekaligus. Seluruh baris masuk sebagai SATU batch — tidak
 * pernah separuh — lalu tiap baris diputuskan seperti pengajuan biasa.
 */
export function FormPengajuanMassal({
  pengguna,
  sedang,
  galat,
  onKirim,
}: {
  /** Calon peserta: akun perangkat desa yang masih aktif. */
  pengguna: User[];
  sedang: boolean;
  /** Galat dari lapisan data, mis. ada id yang tidak dikenal server. */
  galat?: string | null;
  /** Kembalikan jumlah baris yang tersimpan bila berhasil. */
  onKirim: (command: CreateMassalCommand) => Promise<number | null>;
}) {
  const [jenis, setJenis] = useState<RequestType>("CUTI");
  const [mulai, setMulai] = useState(tanggalISO(new Date()));
  const [selesai, setSelesai] = useState(tanggalISO(new Date()));
  const [alasan, setAlasan] = useState("");
  const [dipilih, setDipilih] = useState<string[]>([]);
  const [hasil, setHasil] = useState<string | null>(null);
  const [terbalik, setTerbalik] = useState(false);

  const semuaId = useMemo(() => pengguna.map((u) => u.id), [pengguna]);
  const semuaDipilih = dipilih.length > 0 && dipilih.length === pengguna.length;

  function alih(id: string) {
    setHasil(null);
    setDipilih((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }

  function alihSemua() {
    setHasil(null);
    setDipilih((l) => (l.length === pengguna.length ? [] : [...semuaId]));
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setHasil(null);
    setTerbalik(false);
    if (selesai < mulai) {
      setTerbalik(true);
      return;
    }
    const jumlah = await onKirim({
      type: jenis,
      startDate: mulai,
      endDate: selesai,
      reason: alasan.trim(),
      userIds: dipilih,
    });
    if (jumlah !== null) {
      setHasil(`Tersimpan ${jumlah} pengajuan dalam satu batch.`);
      setAlasan("");
      setDipilih([]);
    }
  }

  const kirimMati = sedang || pengguna.length === 0 || dipilih.length === 0 || !alasan.trim();

  return (
    <Card>
      <CardHeader
        title="Pengajuan massal"
        sub="Satu kiriman untuk banyak perangkat — mis. cuti bersama. Seluruh baris tersimpan sekaligus."
      />
      <form onSubmit={(e) => void kirim(e)} className="space-y-4 px-4 pb-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jenis pengajuan">
            <Select value={jenis} onChange={(e) => setJenis(e.target.value as RequestType)}>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {REQUEST_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal mulai">
            <Input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
          </Field>
          <Field label="Tanggal selesai">
            <Input type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} />
          </Field>
        </div>

        <Field label="Alasan / keterangan bersama" hint="Alasan yang sama dipakai untuk seluruh baris batch ini.">
          <Textarea
            rows={2}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Cth. Cuti bersama Hari Raya Idulfitri 1447 H…"
          />
        </Field>

        <fieldset>
          <legend className="label-arsip mb-1.5 block text-tinta/50">
            Perangkat yang dicakup · {dipilih.length} dari {pengguna.length} dipilih
          </legend>
          {pengguna.length === 0 ? (
            <p className="rounded-kendali border border-garis px-3 py-2.5 text-[13px] text-tinta/50">
              Tidak ada akun perangkat desa yang aktif.
            </p>
          ) : (
            <div className="rounded-kendali border border-garis">
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-garis bg-folio-2 px-3 py-2 text-[13px] font-semibold">
                <input type="checkbox" checked={semuaDipilih} onChange={alihSemua} className="h-4 w-4" />
                Pilih semua
              </label>
              <ul className="max-h-56 divide-y divide-garis overflow-y-auto">
                {pengguna.map((u) => (
                  <li key={u.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-folio-2">
                      <input
                        type="checkbox"
                        checked={dipilih.includes(u.id)}
                        onChange={() => alih(u.id)}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{u.fullName}</span>
                        <span className="block truncate text-[12px] text-tinta/50">
                          {ROLE_LABEL[u.role]} · {u.official.position}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>

        {terbalik ? (
          <p role="alert" className="text-[13px] font-medium text-bahaya">
            Tanggal selesai tidak boleh sebelum tanggal mulai.
          </p>
        ) : null}
        {galat ? (
          <p role="alert" className="text-[13px] font-medium text-bahaya">
            {galat}
          </p>
        ) : null}
        {hasil ? <p className="text-[13px] font-medium text-primer">{hasil}</p> : null}

        <Button variasi="utama" className="gap-2" disabled={kirimMati}>
          <Send className="h-4 w-4" />
          {sedang ? "Menyimpan…" : `Kirim untuk ${dipilih.length} perangkat`}
        </Button>
      </form>
    </Card>
  );
}
