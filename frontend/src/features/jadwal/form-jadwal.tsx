"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import {
  ATTENDANCE_STATUS_LABEL,
  HARI_LABEL,
  URUTAN_HARI,
  type AttendanceStatus,
  type AttendanceType,
  type WorkSchedule,
} from "@/core/domain/attendance";
import type { UpdateScheduleCommand } from "@/core/ports/gateways";
import { evaluateCheckIn, evaluateCheckOut } from "@/core/usecase/attendance-status";
import { validasiJadwal } from "@/core/usecase/jadwal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { menitDari } from "@/lib/waktu";

const NADA_STATUS: Record<AttendanceStatus, "primer" | "bahaya" | "peringatan" | "info"> = {
  TEPAT_WAKTU: "primer",
  TERLAMBAT: "bahaya",
  PULANG_CEPAT: "peringatan",
  LEBIH_KERJA: "info",
};

function dariJadwal(jadwal: WorkSchedule): UpdateScheduleCommand {
  return {
    checkInStart: jadwal.checkInStart,
    checkInDeadline: jadwal.checkInDeadline,
    checkOutStart: jadwal.checkOutStart,
    checkOutEnd: jadwal.checkOutEnd,
    workDays: [...jadwal.workDays],
  };
}

/** Geser "HH:MM" sebanyak n menit, dibulatkan dalam satu hari. */
function geser(hhmm: string, deltaMenit: number): string {
  const total = (menitDari(hhmm) + deltaMenit + 1_440) % 1_440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Penilaian sebuah contoh jam memakai aturan yang sama dengan presensi asli. */
function nilai(
  jenis: AttendanceType,
  hhmm: string,
  jadwal: WorkSchedule,
): AttendanceStatus {
  const [h, m] = hhmm.split(":").map(Number);
  const pada = new Date(2026, 0, 5, h, m); // Senin, tanggal bebas
  return jenis === "CHECK_IN"
    ? evaluateCheckIn(jadwal, pada).status
    : evaluateCheckOut(jadwal, pada).status;
}

/**
 * Penetapan jam kerja kantor oleh sekretaris/kepala desa.
 *
 * Nilainya sengaja berbentuk jam (bukan pukul pasti) karena begitulah presensi
 * dinilai: datang **sampai** batas masuk dihitung tepat waktu, pulang **dari**
 * jam pulang sampai batas pulang dihitung tepat waktu. Pratinjau di bawah
 * formulir menghitung ulang contoh jam lewat `evaluateCheckIn`/`evaluateCheckOut`
 * — fungsi yang sama yang dipakai presensi sungguhan — sehingga apa yang
 * tertulis di layar ini tidak mungkin menyimpang dari yang dicatat sistem.
 */
export function FormJadwal({
  jadwal,
  sedang,
  galat,
  onSimpan,
}: {
  jadwal: WorkSchedule;
  sedang: boolean;
  /** Galat dari lapisan data, mis. jam kerja yang tidak masuk akal. */
  galat?: string | null;
  /** Simpan jam kerja; `false` bila pintu data menolak. */
  onSimpan: (command: UpdateScheduleCommand) => Promise<boolean>;
}) {
  const [form, setForm] = useState<UpdateScheduleCommand>(() => dariJadwal(jadwal));
  const periksa = useMemo(() => validasiJadwal(form), [form]);

  function isi<K extends keyof UpdateScheduleCommand>(
    kunci: K,
    nilaiBaru: UpdateScheduleCommand[K],
  ) {
    setForm((lama) => ({ ...lama, [kunci]: nilaiBaru }));
  }

  function alihHari(hari: number) {
    setForm((lama) => ({
      ...lama,
      workDays: lama.workDays.includes(hari)
        ? lama.workDays.filter((h) => h !== hari)
        : [...lama.workDays, hari].sort((a, b) => a - b),
    }));
  }

  const draf: WorkSchedule = { ...jadwal, ...form, workDays: [...form.workDays] };

  /** Kirim isian bila sah; jangan biarkan data yang tidak masuk akal tersimpan. */
  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!periksa.sah) return;
    await onSimpan(form);
  }

  const contoh: { jenis: AttendanceType; jam: string }[] = [
    { jenis: "CHECK_IN", jam: geser(form.checkInDeadline, -10) },
    { jenis: "CHECK_IN", jam: form.checkInDeadline },
    { jenis: "CHECK_IN", jam: geser(form.checkInDeadline, 15) },
    { jenis: "CHECK_OUT", jam: geser(form.checkOutStart, -30) },
    { jenis: "CHECK_OUT", jam: form.checkOutStart },
    { jenis: "CHECK_OUT", jam: geser(form.checkOutEnd, 30) },
  ];

  return (
    <Card>
      <CardHeader
        title="Jam kerja kantor"
        sub="Berlaku untuk seluruh perangkat desa dan langsung dipakai presensi berikutnya"
      />
      <form onSubmit={kirim} className="space-y-5 p-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Jam masuk" hint="Awal jendela presensi datang">
            <Input
              type="time"
              value={form.checkInStart}
              onChange={(e) => isi("checkInStart", e.target.value)}
              className="angka-ukur"
              required
            />
          </Field>
          <Field label="Batas masuk" hint="Lewat jam ini tercatat terlambat">
            <Input
              type="time"
              value={form.checkInDeadline}
              onChange={(e) => isi("checkInDeadline", e.target.value)}
              className="angka-ukur"
              required
            />
          </Field>
          <Field label="Jam pulang" hint="Sebelum jam ini tercatat pulang cepat">
            <Input
              type="time"
              value={form.checkOutStart}
              onChange={(e) => isi("checkOutStart", e.target.value)}
              className="angka-ukur"
              required
            />
          </Field>
          <Field label="Batas pulang" hint="Setelah jam ini tercatat lebih kerja">
            <Input
              type="time"
              value={form.checkOutEnd}
              onChange={(e) => isi("checkOutEnd", e.target.value)}
              className="angka-ukur"
              required
            />
          </Field>
        </div>

        <div>
          <span className="label-arsip mb-1.5 block text-tinta/50">Hari kerja</span>
          <div className="flex flex-wrap gap-2">
            {URUTAN_HARI.map((hari) => {
              const aktif = form.workDays.includes(hari);
              return (
                <button
                  key={hari}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => alihHari(hari)}
                  className={cn(
                    "h-9 rounded-kendali border px-3 text-[13px] font-semibold transition-colors",
                    aktif
                      ? "border-primer/35 bg-primer/10 text-primer"
                      : "border-garis bg-folio text-tinta/45 hover:border-tinta/25",
                  )}
                >
                  {HARI_LABEL[hari]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">
            Hari yang tidak dipilih tidak dihitung sebagai hari kerja — presensi
            di hari itu tidak dinilai terlambat.
          </p>
        </div>

        <div className="rounded-slip border border-garis bg-folio-2/60 p-4">
          <p className="label-arsip text-tinta/45">Pratinjau aturan</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {contoh.map((c) => {
              const status = nilai(c.jenis, c.jam, draf);
              return (
                <li
                  key={`${c.jenis}-${c.jam}`}
                  className="flex items-center justify-between gap-3 rounded-tanda border border-garis bg-folio px-3 py-2"
                >
                  <span className="text-[12.5px] text-tinta/65">
                    {c.jenis === "CHECK_IN" ? "Datang" : "Pulang"}{" "}
                    <span className="angka-ukur text-tinta">{c.jam}</span>
                  </span>
                  <Badge nada={NADA_STATUS[status]}>
                    {ATTENDANCE_STATUS_LABEL[status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] leading-snug text-tinta/50">
            Contoh jam di atas dinilai memakai fungsi yang sama dengan presensi
            sungguhan, jadi tidak ada aturan ganda antara layar ini dan catatan
            presensi.
          </p>
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
            {sedang ? "Menyimpan…" : "Simpan jam kerja"}
          </Button>
          <p className="text-[12px] text-tinta/50">
            Perubahan berlaku untuk semua perangkat dan tercatat pada log audit
            beserta jam kerja sebelum dan sesudahnya.
          </p>
        </div>
      </form>
    </Card>
  );
}
