"use client";

import type { HariLibur } from "@/core/domain/libur";
import { JENIS_LIBUR_LABEL } from "@/core/domain/libur";
import { tanggalISO } from "@/lib/waktu";
import { cn } from "@/lib/cn";

/**
 * Inisial hari dua huruf: "S" saja ambigu antara Minggu/Senin/Selasa/Sabtu,
 * dan sebelumnya label terakhir malah tertulis "M" untuk hari Sabtu.
 */
const HARI = ["Mi", "Se", "Sl", "Ra", "Ka", "Ju", "Sa"];

/** Grid kalender satu bulan berjalan dengan penanda kehadiran. */
export function KalenderBulan({
  hadir,
  libur,
}: {
  /**
   * peta tanggal ISO → status hari itu: hadir tepat waktu, hadir terlambat,
   * atau hari kerja yang tutup buku tanpa presensi dan tanpa izin/sakit/cuti
   * (tanpa keterangan).
   */
  hadir: Map<string, "tepat" | "terlambat" | "tanpa">;
  /**
   * peta tanggal ISO → catatan hari libur (nasional, cuti bersama, lokal).
   * Hari libur tidak menuntut presensi, jadi tanggalnya ditandai tersendiri —
   * bukan sebagai "tanpa keterangan".
   */
  libur?: ReadonlyMap<string, HariLibur>;
}) {
  const kini = new Date();
  const tahun = kini.getFullYear();
  const bulan = kini.getMonth();
  const hariPertama = new Date(tahun, bulan, 1).getDay();
  const jumlahHari = new Date(tahun, bulan + 1, 0).getDate();
  const kiniIso = tanggalISO(kini);

  const sel: Array<{ tgl: number; iso: string } | null> = [
    ...Array.from({ length: hariPertama }, () => null),
    ...Array.from({ length: jumlahHari }, (_, i) => {
      const iso = `${tahun}-${String(bulan + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { tgl: i + 1, iso };
    }),
  ];

  return (
    <div>
      <div className="label-arsip grid grid-cols-7 gap-1 text-center text-tinta/40">
        {HARI.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <span aria-hidden className="garis-kepala mt-2 mb-2.5 block" />
      <div className="grid grid-cols-7 gap-1">
        {sel.map((s, i) => {
          if (!s) return <span key={`kosong-${i}`} />;
          const statusHadir = hadir.get(s.iso);
          const hariLibur = libur?.get(s.iso);
          const iniHariIni = s.iso === kiniIso;
          return (
            <span
              key={s.iso}
              title={
                statusHadir === "terlambat"
                  ? "Hadir terlambat"
                  : statusHadir === "tepat"
                    ? "Hadir tepat waktu"
                    : statusHadir === "tanpa"
                      ? "Tanpa keterangan — hari kerja tanpa presensi dan tanpa izin/sakit/cuti"
                      : hariLibur
                        ? `${hariLibur.nama} — ${JENIS_LIBUR_LABEL[hariLibur.jenis].toLowerCase()}, tidak menuntut presensi`
                        : undefined
              }
              className={cn(
                "angka-ukur relative flex h-8 items-center justify-center rounded-tanda text-[12px]",
                // Hari ini diberi cincin emas, bukan diwarnai penuh, supaya
                // tidak tertukar dengan penanda kehadiran.
                iniHariIni && "ring-1 ring-emas",
                statusHadir === "tepat" && "bg-primer/12 font-semibold text-primer",
                statusHadir === "terlambat" && "bg-bahaya/10 font-semibold text-bahaya",
                statusHadir === "tanpa" && "bg-bahaya/15 font-bold text-bahaya ring-1 ring-bahaya/40",
                !statusHadir && hariLibur && "bg-info/10 font-semibold text-info",
                !statusHadir && !hariLibur && !iniHariIni && "text-tinta/45",
              )}
            >
              {s.tgl}
            </span>
          );
        })}
      </div>
    </div>
  );
}
