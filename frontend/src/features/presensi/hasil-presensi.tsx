"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { PresensiResult, WorkSchedule } from "@/core/ports/gateways";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_TYPE_LABEL } from "@/core/domain/attendance";
import { kalimatSelisihTransaksi } from "@/core/usecase/attendance-status";
import { Badge } from "@/components/ui/badge";
import { Button, TautanTombol } from "@/components/ui/button";
import { jam, tanggalPanjang } from "@/lib/waktu";
import { RingGeofence } from "@/components/ring-geofence";
import { PetaGeofence } from "@/components/peta-geofence";
import { cn } from "@/lib/cn";
import type { Lokasi } from "@/lib/gps";

interface InfoHasil {
  nama: string;
  office: {
    name: string;
    radiusMeters: number;
    point?: { latitude: number; longitude: number };
  };
  lokasi: Lokasi | null;
  /** Jadwal aktif — dipakai menghitung "terlambat/cepat berapa lama". */
  jadwal: WorkSchedule | null;
}

/** Layar hasil presensi: diterima (readout + radar) atau ditolak (alasan). */
export function HasilPresensi({
  hasil,
  info,
  onUlangi,
}: {
  hasil: PresensiResult;
  info: InfoHasil;
  onUlangi: () => void;
}) {
  const [modeTampilan, setModeTampilan] = useState<"peta" | "radar">("peta");

  if (hasil.accepted && hasil.attendance && hasil.verification) {
    const a = hasil.attendance;
    const v = hasil.verification;
    const selisih = kalimatSelisihTransaksi(a, info.jadwal);
    const statusNada =
      a.status === "TERLAMBAT"
        ? "bahaya"
        : a.status === "PULANG_CEPAT"
          ? "peringatan"
          : "primer";

    return (
      <div role="status" aria-live="polite" className="lembar-mendarat grid gap-5 lg:grid-cols-[1fr_0.85fr]">
        <section className="folio overflow-hidden px-5 pb-7 pt-6 sm:px-7">
          <span aria-hidden className="garis-foil absolute inset-x-0 top-0 h-[3px]" />

          <Badge nada="primer">
            <CheckCircle2 className="h-3.5 w-3.5" /> Presensi Berhasil
          </Badge>

          {/* Waktu adalah bukti utama di layar ini — jadi angka terbesar. */}
          <p className="angka-ukur mt-5 text-[52px] font-semibold leading-none tracking-[-0.04em] text-primer sm:text-[64px]">
            {jam(v.serverTime)}
          </p>
          <p className="mt-2 text-[13px] text-tinta/55">
            {tanggalPanjang(v.serverTime)} · waktu server resmi
          </p>

          <div className="mt-7 grid gap-x-6 gap-y-4 border-t border-garis-folio pt-5 sm:grid-cols-2">
            <Baris label="Nama" nilai={info.nama} />
            <Baris label="Jenis" nilai={ATTENDANCE_TYPE_LABEL[a.type]} />
            <Baris
              label="Lokasi"
              nilai={`${info.office.name} · ${Math.round(v.geofence.distanceMeters)} m`}
            />
            <Baris
              label="Akurasi GPS"
              nilai={info.lokasi ? `±${Math.round(info.lokasi.accuracyMeters)} m` : "—"}
            />
            <Baris label="Mode" nilai={a.mode} />
            <Baris
              label="Status"
              nilai={
                selisih
                  ? `${ATTENDANCE_STATUS_LABEL[a.status]} — ${selisih}`
                  : ATTENDANCE_STATUS_LABEL[a.status]
              }
              nada={statusNada}
            />
            <Baris label="Kemiripan wajah (cosine)" nilai={v.faceScore.toFixed(2)} />
            <Baris label="Skor pemeriksaan keaslian" nilai={v.livenessScore.toFixed(2)} />
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <TautanTombol href="/riwayat">Lihat riwayat</TautanTombol>
            <Button variasi="sekunder" onClick={onUlangi} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Presensi lagi
            </Button>
          </div>
        </section>

        <section className="slip px-5 py-5">
          <div className="flex items-center justify-between">
            <p className="label-arsip text-tinta/45">Posisi vs geofence</p>
            <div className="flex rounded-md border border-garis bg-meja/60 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setModeTampilan("peta")}
                className={cn(
                  "rounded px-2.5 py-0.5 transition-colors font-medium",
                  modeTampilan === "peta"
                    ? "bg-putih text-tinta shadow-sm font-semibold"
                    : "text-tinta/50 hover:text-tinta",
                )}
              >
                Peta
              </button>
              <button
                type="button"
                onClick={() => setModeTampilan("radar")}
                className={cn(
                  "rounded px-2.5 py-0.5 transition-colors font-medium",
                  modeTampilan === "radar"
                    ? "bg-putih text-tinta shadow-sm font-semibold"
                    : "text-tinta/50 hover:text-tinta",
                )}
              >
                Radar
              </button>
            </div>
          </div>
          <span aria-hidden className="garis-kepala mt-3 mb-3 block" />

          {modeTampilan === "peta" ? (
            <PetaGeofence
              userLocation={info.lokasi}
              officeLocation={{
                latitude: info.office.point?.latitude ?? -4.4680072,
                longitude: info.office.point?.longitude ?? 119.713862,
                name: info.office.name,
                radiusMeters: info.office.radiusMeters,
              }}
              distanceMeters={v.geofence.distanceMeters}
              isInside={v.geofence.verdict === "INSIDE"}
            />
          ) : (
            <RingGeofence
              jarak={v.geofence.distanceMeters}
              radius={info.office.radiusMeters}
              akurasi={info.lokasi?.accuracyMeters ?? null}
              status={v.geofence.verdict === "INSIDE" ? "DALAM" : "LUAR"}
              namaKantor={info.office.name}
            />
          )}
        </section>
      </div>
    );
  }

  const tolak = hasil.rejection;
  if (tolak?.code === "PENDING_SYNC") {
    return (
      <section role="status" aria-live="polite" className="folio mx-auto max-w-xl px-6 py-8 text-center sm:px-8">
        <span aria-hidden className="mx-auto block h-[3px] w-10 rounded-full bg-peringatan" />
        <span className="mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-peringatan/10">
          <RotateCcw className="h-7 w-7 text-peringatan" />
        </span>
        <h2 className="mt-4 font-display text-[21px] font-bold tracking-[-0.015em]">
          Menunggu Verifikasi Server
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-tinta/65">{tolak.message}</p>
        <Button onClick={onUlangi} className="mt-7">Kembali</Button>
      </section>
    );
  }

  return (
    <section
      role="status"
      aria-live="polite"
      className="folio mx-auto max-w-xl px-6 py-8 text-center sm:px-8"
    >
      <span aria-hidden className="mx-auto block h-[3px] w-10 rounded-full bg-bahaya" />
      <span className="mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-bahaya/8">
        <XCircle className="h-7 w-7 text-bahaya" />
      </span>
      <h2 className="mt-4 font-display text-[21px] font-bold tracking-[-0.015em]">
        Presensi tidak dicatat
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-tinta/65">
        {tolak?.message ?? "Terjadi gangguan saat memeriksa presensi Anda."}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button onClick={onUlangi} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Ulangi presensi
        </Button>
        <TautanTombol href="/pengajuan" variasi="sekunder">
          Ajukan koreksi
        </TautanTombol>
      </div>
    </section>
  );
}

function Baris({
  label,
  nilai,
  nada,
}: {
  label: string;
  nilai: string;
  nada?: "primer" | "bahaya" | "peringatan";
}) {
  return (
    <div>
      <p className="label-arsip text-tinta/40">{label}</p>
      <p
        className={
          nada === "bahaya"
            ? "mt-1 text-[14.5px] font-semibold text-bahaya"
            : nada === "peringatan"
              ? "mt-1 text-[14.5px] font-semibold text-peringatan"
              : nada === "primer"
                ? "mt-1 text-[14.5px] font-semibold text-primer"
                : "mt-1 text-[14.5px] font-semibold text-tinta"
        }
      >
        {nilai}
      </p>
    </div>
  );
}
