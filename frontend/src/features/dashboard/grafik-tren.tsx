"use client";

import { useMemo } from "react";
import {
  TrendingUp,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  UserCheck,
  UserX,
} from "lucide-react";
import type { MonthlyRecapRow } from "@/core/ports/gateways";
import { formatSelisihMenit } from "@/core/usecase/attendance-status";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface DataBulanTren {
  readonly labelBulan: string;
  readonly tahun: number;
  readonly bulan: number;
  readonly baris: readonly MonthlyRecapRow[];
}

interface GrafikTrenProps {
  tren3Bulan: readonly DataBulanTren[];
  dataBulanIni: readonly MonthlyRecapRow[];
}

export function GrafikTrenKedisiplinan({
  tren3Bulan,
  dataBulanIni,
}: GrafikTrenProps) {
  // Hitung ringkasan statistik per bulan
  const ringkasanBulanan = useMemo(() => {
    return tren3Bulan.map((b) => {
      const totalHadir = b.baris.reduce((acc, r) => acc + r.hadir, 0);
      const totalTerlambat = b.baris.reduce((acc, r) => acc + r.terlambat, 0);
      const totalIzinCuti = b.baris.reduce(
        (acc, r) => acc + r.izin + r.sakit + r.cuti,
        0,
      );
      const totalAlpha = b.baris.reduce((acc, r) => acc + r.tanpaKeterangan, 0);
      const totalTerlambatMenit = b.baris.reduce(
        (acc, r) => acc + r.terlambatMenit,
        0,
      );
      const totalHariTercatat = totalHadir + totalIzinCuti + totalAlpha;
      const persenTepatWaktu =
        totalHadir > 0
          ? Math.max(0, Math.round(((totalHadir - totalTerlambat) / totalHadir) * 100))
          : 100;
      const persenKehadiran =
        totalHariTercatat > 0
          ? Math.round((totalHadir / totalHariTercatat) * 100)
          : 100;

      return {
        label: b.labelBulan,
        tahun: b.tahun,
        bulan: b.bulan,
        totalHadir,
        totalTerlambat,
        totalIzinCuti,
        totalAlpha,
        totalTerlambatMenit,
        persenTepatWaktu,
        persenKehadiran,
      };
    });
  }, [tren3Bulan]);

  // Peringkat Aparat Terdisiplin Bulan Berjalan
  const topTerdisiplin = useMemo(() => {
    return [...dataBulanIni]
      .filter((r) => r.hadir > 0)
      .sort((a, b) => {
        // Prioritas 1: keterlambatan paling sedikit (0)
        if (a.terlambat !== b.terlambat) return a.terlambat - b.terlambat;
        // Prioritas 2: durasi menit terlambat paling sedikit
        if (a.terlambatMenit !== b.terlambatMenit)
          return a.terlambatMenit - b.terlambatMenit;
        // Prioritas 3: alpha 0
        if (a.tanpaKeterangan !== b.tanpaKeterangan)
          return a.tanpaKeterangan - b.tanpaKeterangan;
        // Prioritas 4: hari hadir terbanyak
        return b.hadir - a.hadir;
      })
      .slice(0, 3);
  }, [dataBulanIni]);

  // Peringkat Aparat Paling Sering Terlambat / Durasi Tertinggi (Perlu Pembinaan)
  const topTerlambat = useMemo(() => {
    return [...dataBulanIni]
      .filter((r) => r.terlambat > 0 || r.terlambatMenit > 0 || r.tanpaKeterangan > 0)
      .sort((a, b) => {
        if (b.terlambat !== a.terlambat) return b.terlambat - a.terlambat;
        return b.terlambatMenit - a.terlambatMenit;
      })
      .slice(0, 3);
  }, [dataBulanIni]);

  return (
    <div className="space-y-5">
      {/* 1. KARTU GRAFIK TREN 3 BULAN */}
      <Card>
        <CardHeader
          title="Visualisasi Tren Kehadiran & Kedisiplinan (3 Bulan Terakhir)"
          sub="Komparasi tingkat kehadiran tepat waktu, keterlambatan, dan jam terbuang di desa"
        />

        <div className="p-5 sm:p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {ringkasanBulanan.map((b, idx) => {
              const isKini = idx === ringkasanBulanan.length - 1;
              return (
                <div
                  key={`${b.tahun}-${b.bulan}`}
                  className={`rounded-slip border p-4 space-y-3 transition-all ${
                    isKini
                      ? "border-primer/40 bg-primer/5 ring-1 ring-primer/20"
                      : "border-garis bg-folio-2/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-tinta flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primer" />
                      {b.label} {b.tahun}
                    </span>
                    {isKini && (
                      <Badge nada="primer" className="text-[10px]">
                        Bulan Berjalan
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-tinta/60">Tingkat Hadir</span>
                      <span className="font-bold text-tinta">{b.persenKehadiran}%</span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-garis overflow-hidden">
                      <div
                        className="h-full bg-primer rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, b.persenKehadiran))}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-garis-folio text-[11.5px]">
                    <div>
                      <span className="text-tinta/45 block text-[10.5px]">Tepat Waktu</span>
                      <span className="font-semibold text-tinta">
                        {b.totalHadir - b.totalTerlambat} hari
                      </span>
                    </div>
                    <div>
                      <span className="text-tinta/45 block text-[10.5px]">Terlambat</span>
                      <span className={`font-semibold ${b.totalTerlambat > 0 ? "text-bahaya" : "text-tinta"}`}>
                        {b.totalTerlambat} kali
                      </span>
                    </div>
                    <div>
                      <span className="text-tinta/45 block text-[10.5px]">Durasi Lambat</span>
                      <span className={`font-semibold ${b.totalTerlambatMenit > 0 ? "text-bahaya" : "text-tinta/40"}`}>
                        {b.totalTerlambatMenit > 0 ? formatSelisihMenit(b.totalTerlambatMenit) : "0 mnt"}
                      </span>
                    </div>
                    <div>
                      <span className="text-tinta/45 block text-[10.5px]">Tanpa Ket.</span>
                      <span className={`font-semibold ${b.totalAlpha > 0 ? "text-bahaya font-bold" : "text-tinta"}`}>
                        {b.totalAlpha} hari
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Diagram Batang Proporsi Keseluruhan */}
          <div className="rounded-slip border border-garis bg-folio p-4 space-y-2">
            <h4 className="text-xs font-semibold text-tinta flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primer" />
              Perbandingan Proporsi Absensi Perangkat Bulan Ini
            </h4>

            {(() => {
              const bKini = ringkasanBulanan[ringkasanBulanan.length - 1];
              if (!bKini || bKini.totalHadir + bKini.totalIzinCuti + bKini.totalAlpha === 0) {
                return (
                  <p className="text-xs text-tinta/40 py-2">
                    Belum ada data akumulasi presensi bulan berjalan.
                  </p>
                );
              }
              const total = bKini.totalHadir + bKini.totalIzinCuti + bKini.totalAlpha;
              const pTepat = ((bKini.totalHadir - bKini.totalTerlambat) / total) * 100;
              const pLambat = (bKini.totalTerlambat / total) * 100;
              const pIzin = (bKini.totalIzinCuti / total) * 100;
              const pAlpha = (bKini.totalAlpha / total) * 100;

              return (
                <div className="space-y-2 pt-1">
                  <div className="h-4 w-full rounded-full overflow-hidden flex bg-garis text-[9px] font-bold text-white text-center">
                    {pTepat > 0 && (
                      <div
                        style={{ width: `${pTepat}%` }}
                        className="bg-emerald-600 flex items-center justify-center transition-all"
                        title={`Tepat Waktu: ${Math.round(pTepat)}%`}
                      >
                        {pTepat > 10 ? `${Math.round(pTepat)}%` : ""}
                      </div>
                    )}
                    {pLambat > 0 && (
                      <div
                        style={{ width: `${pLambat}%` }}
                        className="bg-amber-500 flex items-center justify-center transition-all"
                        title={`Terlambat: ${Math.round(pLambat)}%`}
                      >
                        {pLambat > 10 ? `${Math.round(pLambat)}%` : ""}
                      </div>
                    )}
                    {pIzin > 0 && (
                      <div
                        style={{ width: `${pIzin}%` }}
                        className="bg-sky-500 flex items-center justify-center transition-all"
                        title={`Izin/Cuti: ${Math.round(pIzin)}%`}
                      >
                        {pIzin > 10 ? `${Math.round(pIzin)}%` : ""}
                      </div>
                    )}
                    {pAlpha > 0 && (
                      <div
                        style={{ width: `${pAlpha}%` }}
                        className="bg-rose-600 flex items-center justify-center transition-all"
                        title={`Tanpa Keterangan: ${Math.round(pAlpha)}%`}
                      >
                        {pAlpha > 10 ? `${Math.round(pAlpha)}%` : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-tinta/70 pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                      Tepat Waktu ({Math.round(pTepat)}%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Terlambat ({Math.round(pLambat)}%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                      Izin / Cuti ({Math.round(pIzin)}%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                      Alpha ({Math.round(pAlpha)}%)
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </Card>

      {/* 2. PERINGKAT KEPATUHAN & KEDISIPLINAN */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* TOP 3 TERDISIPLIN */}
        <Card>
          <CardHeader
            title="3 Aparat Paling Disiplin"
            sub="Tingkat kepatuhan jam kerja tertinggi bulan ini"
          />
          <div className="p-4 sm:p-5 space-y-3">
            {topTerdisiplin.length === 0 ? (
              <p className="text-xs text-tinta/45 py-3 text-center">
                Belum ada data kehadiran bulan ini.
              </p>
            ) : (
              topTerdisiplin.map((u, i) => (
                <div
                  key={u.userId}
                  className="flex items-center justify-between gap-3 rounded-slip border border-garis bg-folio-2/40 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                        i === 0
                          ? "bg-amber-400 text-amber-950 shadow-xs"
                          : i === 1
                          ? "bg-neutral-300 text-neutral-800"
                          : "bg-amber-700/20 text-amber-800"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-tinta">{u.userName}</p>
                      <p className="text-[11px] text-tinta/50">{u.position}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <Badge nada="primer" className="text-[10.5px]">
                      {u.hadir} Hadir ({u.terlambat === 0 ? "0 Terlambat" : `${u.terlambat}x Lambat`})
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* TOP 3 PERLU PEMBINAAN (PALING SERING TERLAMBAT) */}
        <Card>
          <CardHeader
            title="Aparat Perlu Pembinaan Disiplin"
            sub="Frekuensi atau durasi keterlambatan tertinggi bulan ini"
          />
          <div className="p-4 sm:p-5 space-y-3">
            {topTerlambat.length === 0 ? (
              <div className="py-6 text-center text-xs text-tinta/50 flex flex-col items-center gap-1">
                <CheckCircle2 className="h-6 w-6 text-primer/70" />
                <p className="font-medium text-tinta">Semua Perangkat Disiplin</p>
                <p className="text-tinta/50 text-[11px]">Tidak ada keterlambatan tercatat bulan ini.</p>
              </div>
            ) : (
              topTerlambat.map((u, i) => (
                <div
                  key={u.userId}
                  className="flex items-center justify-between gap-3 rounded-slip border border-bahaya/20 bg-bahaya/5 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bahaya/20 text-bahaya text-xs font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-tinta">{u.userName}</p>
                      <p className="text-[11px] text-tinta/50">{u.position}</p>
                    </div>
                  </div>

                  <div className="text-right space-y-0.5">
                    <span className="font-bold text-xs text-bahaya block">
                      {u.terlambat}x Terlambat
                    </span>
                    <span className="text-[11px] text-tinta/50 block">
                      Total: {u.terlambatMenit > 0 ? formatSelisihMenit(u.terlambatMenit) : "—"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
