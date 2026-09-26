"use client";

import { Fingerprint, MapPin, ShieldCheck, Sunrise, Sunset } from "lucide-react";
import {
  ATTENDANCE_MODE_LABEL,
  type AttendanceMode,
  type AttendanceType,
  type WorkSchedule,
} from "@/core/domain/attendance";
import { cn } from "@/lib/cn";

interface Pilihan {
  jenis: AttendanceType;
  judul: string;
  ikon: React.ReactNode;
  /** Ringkasan jam kerja yang berlaku untuk pilihan ini. */
  patokan: string;
  catatan: string;
  /** Alasan pilihan tidak dapat dipakai; `null` berarti boleh ditekan. */
  halangan: string | null;
}

/**
 * Panel pemilihan jenis presensi: **datang** atau **pulang**.
 *
 * Jenisnya dipilih pengguna, bukan ditebak sistem, karena keduanya memang
 * perbuatan yang berbeda dan patokan jamnya berbeda pula — datang dinilai
 * terhadap batas masuk (terlambat), pulang dinilai terhadap jam pulang (pulang
 * cepat). Pilihan yang belum waktunya tetap ditampilkan dalam keadaan tidak
 * dapat ditekan beserta alasannya, supaya urutan "datang dahulu, lalu pulang"
 * terbaca sebelum pengguna salah menekan tombol — bukan sebagai galat setelah
 * kamera menyala.
 */
export function PanelMulai({
  namaKantor,
  radius,
  jadwal,
  sudahMasuk,
  jamMasukHariIni,
  modeSaran,
  onMulai,
}: {
  namaKantor: string;
  radius: number;
  jadwal: WorkSchedule;
  /** Presensi datang hari ini sudah tercatat. */
  sudahMasuk: boolean;
  /** Jam presensi datang hari ini ("07.41"), bila ada. */
  jamMasukHariIni?: string | null;
  /**
   * Mode yang diakui pengajuan disetujui hari ini (WFH/dinas luar). Presensi
   * tetap wajib — panel menampilkannya supaya pengguna tahu radius kantor tidak
   * mengikat dan mode apa yang akan tercatat, bukan mengunci pintunya.
   */
  modeSaran?: AttendanceMode | null;
  onMulai: (jenis: AttendanceType) => void;
}) {
  const pilihan: Pilihan[] = [
    {
      jenis: "CHECK_IN",
      judul: "Presensi Datang",
      ikon: <Sunrise className="h-5 w-5" />,
      patokan: `${jadwal.checkInStart}–${jadwal.checkInDeadline} WITA`,
      catatan: `Tepat waktu sampai pukul ${jadwal.checkInDeadline}; setelah itu tercatat terlambat.`,
      halangan: sudahMasuk
        ? `Sudah tercatat datang pukul ${jamMasukHariIni ?? "—"} — yang tersisa presensi pulang.`
        : null,
    },
    {
      jenis: "CHECK_OUT",
      judul: "Presensi Pulang",
      ikon: <Sunset className="h-5 w-5" />,
      patokan: `${jadwal.checkOutStart}–${jadwal.checkOutEnd} WITA`,
      catatan: `Pulang sebelum pukul ${jadwal.checkOutStart} tercatat pulang cepat.`,
      halangan: sudahMasuk
        ? null
        : "Butuh presensi datang lebih dahulu hari ini.",
    },
  ];

  return (
    <section className="folio relative mx-auto max-w-xl overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
      <span aria-hidden className="garis-foil absolute inset-x-0 top-0 h-[3px]" />

      <p className="label-arsip text-tinta/40">Pilih jenis presensi</p>
      <h2 className="mt-3 max-w-md font-display text-[22px] font-bold leading-snug tracking-[-0.015em] sm:text-[25px]">
        Datang atau pulang?
      </h2>
      <p className="mt-2 max-w-md text-[13.5px] leading-6 text-tinta/65">
        Kamera, lokasi, dan waktu server diurus sistem. Waktu yang tercatat
        selalu jam server — pilihan Anda hanya menentukan jenis presensinya.
      </p>

      {modeSaran ? (
        <p className="mt-4 flex items-start gap-2 rounded-slip border border-info/30 bg-info/8 px-3.5 py-2.5 text-[12.5px] leading-5 text-info">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Pengajuan <strong>{ATTENDANCE_MODE_LABEL[modeSaran]}</strong> Anda
            disetujui hari ini. Presensi tetap wajib dan akan tercatat dengan mode
            itu — radius kantor tidak mengikat pada mode ini.
          </span>
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {pilihan.map((p) => {
          const siap = p.halangan === null;
          return (
            <button
              key={p.jenis}
              type="button"
              disabled={!siap}
              onClick={() => onMulai(p.jenis)}
              className={cn(
                "group flex w-full items-start gap-4 rounded-slip border px-4 py-4 text-left transition-colors",
                siap
                  ? "border-garis bg-folio-2/60 hover:border-primer/40 hover:bg-primer/6"
                  : "cursor-not-allowed border-dashed border-garis bg-meja/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-kendali",
                  siap ? "bg-primer/10 text-primer" : "bg-tinta/6 text-tinta/35",
                )}
              >
                {p.ikon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      "font-display text-[16px] font-bold tracking-[-0.01em]",
                      siap ? "text-tinta" : "text-tinta/45",
                    )}
                  >
                    {p.judul}
                  </span>
                  <span
                    className={cn(
                      "angka-ukur text-[11.5px]",
                      siap ? "text-primer" : "text-tinta/35",
                    )}
                  >
                    {p.patokan}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1 block text-[12.5px] leading-5",
                    siap ? "text-tinta/60" : "text-tinta/40",
                  )}
                >
                  {p.halangan ?? p.catatan}
                </span>
              </span>
              {siap ? (
                <Fingerprint className="mt-2 h-4 w-4 shrink-0 text-primer/60 transition-colors group-hover:text-primer" />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="angka-ukur mt-5 flex items-center justify-center gap-1.5 text-[11px] text-tinta/40">
        <MapPin className="h-3.5 w-3.5" />
        {namaKantor} · {radius} m
      </p>
    </section>
  );
}

/** Catatan yang menjelaskan asal data dinamis di bawah panel mulai. */
export function CatatanMode({ modeHttp }: { modeHttp: boolean }) {
  if (modeHttp) {
    return (
      <p className="label-arsip mt-4 text-center text-primer">
        GPS dinilai dari posisi perangkat Anda
      </p>
    );
  }
  return (
    <p className="label-arsip mt-4 text-center text-info">
      mode contoh: GPS akan memakai posisi demo 37 m dari kantor
    </p>
  );
}

/** Catatan mode demo di bawah panel mulai. */
export function CatatanDemo({ tampil }: { tampil: boolean }) {
  if (!tampil) return null;
  return (
    <p className="label-arsip mt-4 text-center text-info">
      mode contoh: GPS akan memakai posisi demo 37 m dari kantor
    </p>
  );
}
