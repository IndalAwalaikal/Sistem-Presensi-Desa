"use client";

import Link from "next/link";
import { ArrowRight, CalendarCheck, MoonStar, Sunrise, Sunset } from "lucide-react";
import type { TodayStatus, WorkSchedule } from "@/core/ports/gateways";
import { jam, tanggalPanjang, jamISO, menitDari } from "@/lib/waktu";
import { ATTENDANCE_STATUS_LABEL } from "@/core/domain/attendance";
import {
  formatSelisihMenit,
  kalimatSelisihTransaksi,
} from "@/core/usecase/attendance-status";
import { TeraKontur } from "@/components/ui/tera-kontur";

/** Cap di atas sampul gelap — label arsip mono, sama dengan penanda lain. */
function Cap({ teks, ikon }: { teks: string; ikon: React.ReactNode }) {
  return (
    <span className="label-arsip inline-flex items-center gap-1.5 rounded-tanda border border-putih/25 bg-putih/6 px-2 py-1 text-putih/85">
      {ikon}
      {teks}
    </span>
  );
}

function JudulHero({ teks }: { teks: string }) {
  return (
    <h2 className="mt-4 max-w-md font-display text-[23px] font-bold leading-snug tracking-[-0.015em] sm:text-[26px]">
      {teks}
    </h2>
  );
}

function TautanPutih({ href, teks }: { href: string; teks: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center gap-2 rounded-kendali bg-folio px-5 text-[14px] font-bold text-sampul shadow-slip transition-colors hover:bg-putih"
    >
      {teks} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

/**
 * Kartu status hari ini — sampul kecil: bukram hijau, cetakan kontur, dan
 * batang emas foil di sisi kiri sebagai punggung lembar.
 */
export function KartuStatus({
  status,
  jadwal,
}: {
  status: TodayStatus;
  jadwal?: WorkSchedule | null;
}) {
  const kini = new Date();
  // Jadwal yang dipakai menghitung selisih: `undefined` (belum dimuat) sama
  // artinya dengan null — tidak ada ambang yang bisa dibandingkan.
  const ambang = jadwal ?? null;
  const sapa =
    kini.getHours() < 11 ? "Selamat pagi" : kini.getHours() < 15 ? "Selamat siang" : "Selamat sore";

  let pengingat: string | null = null;
  if (jadwal) {
    const sisa = menitDari(jadwal.checkInDeadline) - menitDari(jamISO(kini));
    if (sisa > 0 && sisa <= 120) {
      pengingat = `Batas masuk ${jadwal.checkInDeadline} WITA — sisa ${sisa} mnt`;
    } else if (sisa < 0 && sisa > -240) {
      // Batas masuk sudah lewat tapi belum presensi: sebutkan berapa menit
      // lewat — angka itulah yang membuat keterlambatan terasa, bukan labelnya.
      pengingat = `Terlambat ${formatSelisihMenit(-sisa)} dari batas masuk ${jadwal.checkInDeadline} — presensi akan tercatat terlambat`;
    }
  }

  // Sudah masuk tapi belum pulang: keterangan "lambat berapa menit" sudah bisa
  // disebut sekarang, tidak perlu menunggu presensi pulang.
  const keteranganMasuk =
    status.kind === "SUDAH_CHECKIN"
      ? kalimatSelisihTransaksi(status.attendance, ambang)
      : null;

  return (
    <section className="bukram relative overflow-hidden rounded-lembar text-putih">
      {/*
       * Kontur cetak menggantikan radar dekoratif yang dulu dipakai di sini:
       * radar hanya dipakai untuk hal yang benar-benar berarti (RingGeofence).
       */}
      <TeraKontur className="absolute -right-28 -top-36 h-[30rem] w-[30rem] text-putih opacity-[0.13]" />
      <span aria-hidden className="garis-foil absolute inset-y-0 left-0 w-[3px]" />

      <div className="relative z-10 px-6 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="label-arsip text-putih/50">Status hari ini</p>
          <p className="angka-ukur text-[11.5px] text-putih/60">
            {tanggalPanjang(kini)}
          </p>
        </div>

        {status.kind === "IZIN" ? (
          <>
            <div className="mt-5">
              <Cap teks={status.label} ikon={<CalendarCheck className="h-3.5 w-3.5" />} />
            </div>
            <JudulHero teks={`${sapa}. Anda tercatat ${status.label.toLowerCase()} hari ini.`} />
            <p className="mt-2 max-w-md text-[13.5px] leading-6 text-putih/65">
              Tidak perlu presensi kamera — status berasal dari pengajuan yang disetujui.
            </p>
          </>
        ) : status.kind === "SELESAI" ? (
          <>
            <div className="mt-5">
              <Cap teks="Presensi lengkap" ikon={<CalendarCheck className="h-3.5 w-3.5" />} />
            </div>
            <JudulHero teks={`${sapa}. Kerja hari ini selesai.`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Bacaan
                ikon={<Sunrise className="h-4 w-4 text-emas-terang" />}
                label="Masuk"
                nilai={jam(status.checkIn.verification.serverTime)}
                status={status.checkIn.status}
                selisih={kalimatSelisihTransaksi(status.checkIn, ambang)}
              />
              <Bacaan
                ikon={<Sunset className="h-4 w-4 text-emas-terang" />}
                label="Pulang"
                nilai={jam(status.checkOut.verification.serverTime)}
                status={status.checkOut.status}
                selisih={kalimatSelisihTransaksi(status.checkOut, ambang)}
              />
            </div>
          </>
        ) : status.kind === "SUDAH_CHECKIN" ? (
          <>
            <div className="mt-5">
              <Cap teks="Sudah masuk — belum pulang" ikon={<Sunrise className="h-3.5 w-3.5" />} />
            </div>
            <JudulHero teks={`${sapa}. Jangan lupa presensi pulang.`} />
            <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p className="angka-ukur text-[46px] font-semibold leading-none tracking-[-0.03em]">
                  {jam(status.attendance.verification.serverTime)}
                </p>
                <p className="mt-2 text-[12px] text-putih/60">
                  jam masuk tercatat ·{" "}
                  {Math.round(status.attendance.verification.geofence.distanceMeters)} m
                  dari kantor
                </p>
                {keteranganMasuk ? (
                  <p className="label-arsip mt-2 inline-block rounded-tanda border border-emas/60 bg-emas/10 px-2 py-1 text-emas-terang">
                    {keteranganMasuk}
                  </p>
                ) : null}
              </div>
              <TautanPutih href="/presensi" teks="Presensi Pulang" />
            </div>
          </>
        ) : (
          <>
            <div className="mt-5">
              <Cap teks="Belum presensi" ikon={<MoonStar className="h-3.5 w-3.5" />} />
            </div>
            <JudulHero teks={`${sapa}. Anda belum presensi hari ini.`} />
            <p className="mt-2 max-w-md text-[13.5px] leading-6 text-putih/65">
              Satu tombol — kamera, lokasi, dan waktu server diurus sistem.
            </p>
            {pengingat ? (
              <p className="label-arsip mt-3 inline-block rounded-tanda border border-emas/60 bg-emas/10 px-2 py-1 text-emas-terang">
                {pengingat}
              </p>
            ) : null}
            <div className="mt-5">
              <TautanPutih href="/presensi" teks="Mulai Presensi" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Bacaan instrumen di dalam sampul — nilai waktu selalu mono. */
function Bacaan({
  ikon,
  label,
  nilai,
  status,
  selisih,
}: {
  ikon: React.ReactNode;
  label: string;
  nilai: string;
  status: string;
  /** Keterangan durasi, mis. "terlambat 25 mnt dari batas masuk 08:00". */
  selisih?: string | null;
}) {
  const labelStatus =
    ATTENDANCE_STATUS_LABEL[status as keyof typeof ATTENDANCE_STATUS_LABEL] ?? status;
  return (
    <div className="rounded-slip border border-putih/15 bg-putih/6 px-4 py-3">
      <p className="label-arsip flex items-center gap-1.5 text-putih/70">
        {ikon}
        {label}
      </p>
      <p className="angka-ukur mt-1.5 text-[26px] font-semibold leading-none">{nilai}</p>
      <p className="mt-1 text-[11.5px] text-putih/55">{labelStatus}</p>
      {selisih ? (
        <p className="mt-1 text-[11.5px] font-medium text-emas-terang">{selisih}</p>
      ) : null}
    </div>
  );
}
