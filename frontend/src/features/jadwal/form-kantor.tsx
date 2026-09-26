"use client";

import { useState } from "react";
import { LocateFixed, Save } from "lucide-react";
import { evaluateGeofence, type OfficeLocation } from "@/core/domain/attendance";
import type { UpdateOfficeCommand } from "@/core/ports/gateways";
import {
  RADIUS_MAKS_METER,
  RADIUS_MIN_METER,
  rapikanKantor,
  validasiKantor,
} from "@/core/usecase/kantor";
import { ambilLokasi, type Lokasi } from "@/lib/gps";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** Cukup 7 desimal (≈1 cm) — sama dengan kolom `DECIMAL(10,7)` di basis data. */
const DESIMAL_KOORDINAT = 7;

interface IsianKantor {
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
}

/** Isian kosong harus menjadi `NaN`, bukan 0 — (0, 0) adalah titik sah di laut. */
function angka(teks: string): number {
  const bersih = teks.trim();
  return bersih === "" ? Number.NaN : Number(bersih);
}

function dariKantor(kantor: OfficeLocation): IsianKantor {
  return {
    name: kantor.name,
    latitude: kantor.point.latitude.toFixed(DESIMAL_KOORDINAT),
    longitude: kantor.point.longitude.toFixed(DESIMAL_KOORDINAT),
    radiusMeters: String(kantor.radiusMeters),
  };
}

/** Hasil pembacaan posisi perangkat — hanya untuk uji mandiri di layar ini. */
type Bacaan =
  | { fase: "diam" }
  | { fase: "mengambil" }
  | { fase: "terbaca"; titik: Lokasi }
  | { fase: "gagal"; pesan: string };

/**
 * Penetapan titik & radius geofence kantor.
 *
 * Titik kantor harus diambil di tempat kerja yang sebenarnya: pengelola akun
 * membuka halaman ini dari perangkat yang dipakai presensi (komputer meja
 * kantor), menekan "Pakai lokasi perangkat ini", lalu menyimpan. Uji mandiri di
 * bawah formulir memakai `evaluateGeofence` — fungsi yang sama dengan keputusan
 * presensi sungguhan — sehingga apa yang terbaca di layar ini tidak mungkin
 * menyimpang dari yang dicatat sistem.
 */
export function FormKantor({
  kantor,
  akurasiMaksMeter,
  sedang,
  galat,
  onSimpan,
}: {
  kantor: OfficeLocation;
  /** Batas akurasi GPS yang ditegakkan server, dalam meter. */
  akurasiMaksMeter: number;
  sedang: boolean;
  /** Galat dari lapisan data, mis. koordinat yang ditolak server. */
  galat?: string | null;
  /** Simpan lokasi kantor; `false` bila pintu data menolak. */
  onSimpan: (command: UpdateOfficeCommand) => Promise<boolean>;
}) {
  const [form, setForm] = useState<IsianKantor>(() => dariKantor(kantor));
  // Komponen dipasang ulang saat nilai server berubah agar formulir mengikuti
  // lokasi tersimpan tanpa memanggil setState ketika render berlangsung.
  const [bacaan, setBacaan] = useState<Bacaan>({ fase: "diam" });

  const command: UpdateOfficeCommand = {
    name: form.name,
    latitude: angka(form.latitude),
    longitude: angka(form.longitude),
    radiusMeters: angka(form.radiusMeters),
  };
  const periksa = validasiKantor(command);

  const draf: OfficeLocation = {
    id: kantor.id,
    name: form.name,
    point: { latitude: command.latitude, longitude: command.longitude },
    radiusMeters: command.radiusMeters,
  };
  // Uji mandiri baru bermakna bila draf titiknya sendiri sudah masuk akal.
  const uji =
    periksa.sah && bacaan.fase === "terbaca"
      ? evaluateGeofence(bacaan.titik, bacaan.titik.accuracyMeters, draf, akurasiMaksMeter)
      : null;

  function isi(kunci: keyof IsianKantor, nilaiBaru: string) {
    setForm((lama) => ({ ...lama, [kunci]: nilaiBaru }));
  }

  /** Ambil posisi perangkat yang sedang dipakai — sumber yang sama dengan presensi. */
  async function pakaiLokasiPerangkat() {
    setBacaan({ fase: "mengambil" });
    try {
      const titik = await ambilLokasi();
      setBacaan({ fase: "terbaca", titik });
      setForm((lama) => ({
        ...lama,
        latitude: titik.latitude.toFixed(DESIMAL_KOORDINAT),
        longitude: titik.longitude.toFixed(DESIMAL_KOORDINAT),
      }));
    } catch (err) {
      setBacaan({
        fase: "gagal",
        pesan: err instanceof Error ? err.message : "Lokasi perangkat tidak terbaca.",
      });
    }
  }

  /** Kirim isian bila sah; data yang tidak masuk akal tidak boleh tersimpan. */
  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!periksa.sah) return;
    await onSimpan(rapikanKantor(command));
  }

  return (
    <Card>
      <CardHeader
        title="Lokasi kantor"
        sub="Titik & radius geofence — presensi hanya diterima di dalam area ini"
      />
      <form onSubmit={kirim} className="space-y-5 p-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Nama kantor"
            hint="Tampil pada halaman presensi & rekap"
            className="sm:col-span-2 lg:col-span-1"
          >
            <Input
              value={form.name}
              onChange={(e) => isi("name", e.target.value)}
              placeholder="Kantor Desa Anabanua"
              required
            />
          </Field>
          <Field label="Garis lintang" hint="Contoh -4.4680072">
            <Input
              value={form.latitude}
              onChange={(e) => isi("latitude", e.target.value)}
              inputMode="decimal"
              className="angka-ukur"
              required
            />
          </Field>
          <Field label="Garis bujur" hint="Contoh 119.713862">
            <Input
              value={form.longitude}
              onChange={(e) => isi("longitude", e.target.value)}
              inputMode="decimal"
              className="angka-ukur"
              required
            />
          </Field>
          <Field label="Radius (m)" hint={`${RADIUS_MIN_METER}–${RADIUS_MAKS_METER} meter`}>
            <Input
              value={form.radiusMeters}
              onChange={(e) => isi("radiusMeters", e.target.value)}
              inputMode="numeric"
              className="angka-ukur"
              required
            />
          </Field>
        </div>

        <div className="rounded-slip border border-garis bg-folio-2/60 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              className="gap-2"
              onClick={() => void pakaiLokasiPerangkat()}
              disabled={bacaan.fase === "mengambil"}
            >
              <LocateFixed className="h-4 w-4" />
              {bacaan.fase === "mengambil" ? "Membaca lokasi…" : "Pakai lokasi perangkat ini"}
            </Button>
            <p className="text-[12px] leading-snug text-tinta/50">
              Ambil titik dari perangkat yang berdiri di tempat kerja sebenarnya —
              bukan dari peta atau kira-kira, supaya geofence tidak meleset puluhan
              meter.
            </p>
          </div>
          {bacaan.fase === "terbaca" ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-slip border border-garis bg-folio px-3.5 py-2.5">
                <dt className="label-arsip text-tinta/45">Posisi perangkat</dt>
                <dd className="angka-ukur mt-1 text-[13.5px] font-semibold">
                  {bacaan.titik.latitude.toFixed(DESIMAL_KOORDINAT)},{" "}
                  {bacaan.titik.longitude.toFixed(DESIMAL_KOORDINAT)}
                </dd>
              </div>
              <div className="rounded-slip border border-garis bg-folio px-3.5 py-2.5">
                <dt className="label-arsip text-tinta/45">Akurasi GPS</dt>
                <dd className="angka-ukur mt-1 text-[13.5px] font-semibold">
                  ±{Math.round(bacaan.titik.accuracyMeters)} m
                </dd>
              </div>
              <div className="rounded-slip border border-garis bg-folio px-3.5 py-2.5">
                <dt className="label-arsip text-tinta/45">Jarak ke draf titik</dt>
                <dd className="angka-ukur mt-1 text-[13.5px] font-semibold">
                  {uji ? `${Math.round(uji.distanceMeters)} m` : "—"}
                </dd>
              </div>
            </dl>
          ) : null}

          {bacaan.fase === "gagal" ? (
            <p
              role="alert"
              className="mt-3 rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[12.5px] font-medium text-bahaya"
            >
              {bacaan.pesan}
            </p>
          ) : null}
          {uji ? (
            <p
              className={cn(
                "mt-3 rounded-slip border px-3.5 py-2.5 text-[12.5px] leading-snug",
                uji.verdict === "INSIDE"
                  ? "border-primer/30 bg-primer/8 text-primer"
                  : "border-peringatan/35 bg-peringatan/8 text-peringatan",
              )}
            >
              {uji.verdict === "INSIDE"
                ? `Uji mandiri: dengan draf ini perangkat yang dipakai sekarang dianggap di dalam area (jarak ${Math.round(uji.distanceMeters)} m dari titik, radius ${draf.radiusMeters} m).`
                : uji.verdict === "INACCURATE"
                  ? `Uji mandiri: akurasi perangkat ±${Math.round(uji.accuracyMeters)} m melebihi batas ±${akurasiMaksMeter} m — presensi dari perangkat ini akan ditolak sebagai sinyal tidak stabil.`
                  : `Uji mandiri: perangkat ini masih ${Math.round(uji.distanceMeters)} m dari draf titik, sedangkan radiusnya ${draf.radiusMeters} m — presensi akan ditolak.`}
            </p>
          ) : null}
        </div>

        {galat ? (
          <p
            role="alert"
            className="rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] font-medium text-bahaya"
          >
            {galat}
          </p>
        ) : null}

        {!periksa.sah ? (
          <ul className="space-y-1 rounded-slip border border-peringatan/35 bg-peringatan/8 px-3.5 py-2.5 text-[12.5px] text-peringatan">
            {periksa.galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="gap-2" disabled={sedang || !periksa.sah}>
            <Save className="h-4 w-4" />
            {sedang ? "Menyimpan…" : "Simpan lokasi kantor"}
          </Button>
          <p className="text-[12px] text-tinta/50">
            Titik & radius berlaku untuk semua perangkat dan tercatat pada log audit
            beserta nilai sebelum dan sesudahnya.
          </p>
        </div>
      </form>
    </Card>
  );
}
