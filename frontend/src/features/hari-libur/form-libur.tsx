"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { HARI_LABEL, type WorkSchedule } from "@/core/domain/attendance";
import {
  JENIS_LIBUR,
  JENIS_LIBUR_LABEL,
  type HariLibur,
  type JenisLibur,
} from "@/core/domain/libur";
import type { SimpanLiburCommand } from "@/core/ports/gateways";
import { hariDariIso, isHariKerjaIso } from "@/core/usecase/kehadiran";
import { validasiLibur } from "@/core/usecase/libur";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { tanggalPanjang } from "@/lib/waktu";

/**
 * Penetapan satu hari libur oleh sekretaris/kepala desa.
 *
 * Hari yang ditetapkan di sini meniadakan **kewajiban** presensi: tanggalnya
 * tidak pernah dihitung sebagai "tanpa keterangan". Karena itu layar ini
 * menampilkan uji mandiri untuk tanggal yang sedang diisi — apakah tanggal itu
 * benar-benar hari kerja menurut jadwal kantor — supaya tidak ada tanggal libur
 * yang ditetapkan pada hari yang sudah libur (Minggu) tanpa disadari.
 */
export function FormLibur({
  tahun,
  libur,
  jadwal,
  sedang,
  galat,
  onSimpan,
}: {
  /** Tahun yang sedang dibuka — tanggal di luar tahun ini ditolak. */
  tahun: number;
  /** Kalender yang sudah ada; dipakai mengenali tanggal yang berarti "ubah". */
  libur: readonly HariLibur[];
  jadwal: WorkSchedule | null;
  sedang: boolean;
  /** Galat dari lapisan data, mis. tanggal yang ditolak server. */
  galat?: string | null;
  /** Simpan satu tanggal; `false` bila pintu data menolak. */
  onSimpan: (command: SimpanLiburCommand) => Promise<boolean>;
}) {
  const [form, setForm] = useState<{
    tanggal: string;
    nama: string;
    jenis: JenisLibur;
  }>({ tanggal: "", nama: "", jenis: "LIBUR_LOKAL" });

  const periksa = useMemo(() => validasiLibur(form, tahun), [form, tahun]);
  const sudahAda = libur.find((h) => h.tanggal === form.tanggal);
  const hariKerjaJadwal =
    form.tanggal && jadwal ? isHariKerjaIso(jadwal, form.tanggal) : null;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!periksa.sah) return;
    const berhasil = await onSimpan({
      tanggal: form.tanggal,
      nama: form.nama,
      jenis: form.jenis,
    });
    // Isian dikosongkan hanya bila tersimpan, supaya yang gagal tidak hilang.
    if (berhasil) setForm({ tanggal: "", nama: "", jenis: form.jenis });
  }

  return (
    <Card>
      <CardHeader
        title="Tambah atau ubah hari libur"
        sub="Libur lokal desa, atau penyesuaian atas kalender resmi — mis. cuti bersama yang dicabut pemerintah"
      />
      <form onSubmit={simpan} className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal" hint="Satu tanggal dalam satu kali simpan.">
            <Input
              type="date"
              value={form.tanggal}
              min={`${tahun}-01-01`}
              max={`${tahun}-12-31`}
              onChange={(e) => setForm((l) => ({ ...l, tanggal: e.target.value }))}
              required
            />
          </Field>
          <Field
            label="Keterangan"
            hint="Tertulis pada kalender dan rekap — mis. “Hari Jadi Desa”."
          >
            <Input
              value={form.nama}
              maxLength={160}
              placeholder="mis. Hari Jadi Desa Anabanua"
              onChange={(e) => setForm((l) => ({ ...l, nama: e.target.value }))}
              required
            />
          </Field>
        </div>

        <Field
          label="Jenis"
          hint="Libur nasional & cuti bersama mengikuti SKB; libur lokal ditetapkan desa."
        >
          <Select
            value={form.jenis}
            onChange={(e) =>
              setForm((l) => ({ ...l, jenis: e.target.value as JenisLibur }))
            }
          >
            {JENIS_LIBUR.map((j) => (
              <option key={j} value={j}>
                {JENIS_LIBUR_LABEL[j]}
              </option>
            ))}
          </Select>
        </Field>


        {form.tanggal ? (
          <div className="rounded-slip border border-garis bg-folio-2/60 p-4">
            <p className="label-arsip text-tinta/45">Uji mandiri tanggal ini</p>
            <p className="mt-2 text-[13.5px] text-tinta">
              <strong className="angka-ukur">{tanggalPanjang(form.tanggal)}</strong>{" "}
              <span className="text-tinta/55">
                ({HARI_LABEL[hariDariIso(form.tanggal)]})
              </span>
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px] leading-snug">
              {sudahAda ? (
                <li className="text-peringatan">
                  Tanggal ini sudah terdaftar sebagai “{sudahAda.nama}” (
                  {JENIS_LIBUR_LABEL[sudahAda.jenis].toLowerCase()}, {sudahAda.sumber}) —
                  menyimpan berarti mengubahnya.
                </li>
              ) : (
                <li className="text-primer">
                  Tanggal ini belum terdaftar — menyimpan berarti menambahkannya.
                </li>
              )}
              {hariKerjaJadwal === false ? (
                <li className="text-tinta/55">
                  Bukan hari kerja menurut jadwal kantor (akhir pekan atau sudah libur),
                  jadi tanggal ini tidak mengubah perhitungan apa pun.
                </li>
              ) : hariKerjaJadwal === true ? (
                <li className="text-tinta/55">
                  Hari kerja menurut jadwal — setelah disimpan, tanggal ini berhenti
                  dihitung sebagai “tanpa keterangan”.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {galat ? (
          <p
            role="alert"
            className="rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] font-medium text-bahaya"
          >
            {galat}
          </p>
        ) : null}

        {!periksa.sah && form.tanggal ? (
          <ul className="space-y-1 rounded-slip border border-peringatan/35 bg-peringatan/8 px-3.5 py-2.5 text-[12.5px] text-peringatan">
            {periksa.galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="gap-2" disabled={sedang || !periksa.sah}>
            <Save className="h-4 w-4" />
            {sedang ? "Menyimpan…" : sudahAda ? "Ubah hari libur" : "Tambah hari libur"}
          </Button>
          <p className="text-[12px] text-tinta/50">
            Hanya sekretaris dan kepala desa yang dapat mengubah kalender; setiap
            perubahan tercatat pada log audit.
          </p>
        </div>
      </form>
    </Card>
  );
}
