"use client";

import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";
import Image from "next/image";
import type { MonthlyRecapRow } from "@/core/ports/gateways";
import { formatSelisihMenit } from "@/core/usecase/attendance-status";
import { Button } from "@/components/ui/button";

interface ModalCetakRekapPdfProps {
  terbuka: boolean;
  onTutup: () => void;
  periode: { tahun: number; bulan: number };
  namaBulan: string;
  data: readonly MonthlyRecapRow[];
  pejabatMemuat?: boolean;
  siapCetakPejabat?: boolean;
  onCobaMuatPejabat?: () => void;
  namaKepalaDesa?: string;
  nipKepalaDesa?: string;
  namaSekretarisDesa?: string;
  nipSekretarisDesa?: string;
  galatPejabat?: string | null;
}

export function ModalCetakRekapPdf({
  terbuka,
  onTutup,
  periode,
  namaBulan,
  data,
  pejabatMemuat = false,
  siapCetakPejabat = false,
  onCobaMuatPejabat,
  namaKepalaDesa = "",
  nipKepalaDesa = "",
  namaSekretarisDesa = "",
  nipSekretarisDesa = "",
  galatPejabat,
}: ModalCetakRekapPdfProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terbuka) return;
    const fokusSebelumnya = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const tombolAwal = dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    (tombolAwal ?? dialogRef.current)?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onTutup();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const fokus = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => el.offsetParent !== null);
        if (fokus.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
        } else if (e.shiftKey && document.activeElement === fokus[0]) {
          e.preventDefault();
          fokus[fokus.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === fokus[fokus.length - 1]) {
          e.preventDefault();
          fokus[0].focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      fokusSebelumnya?.focus();
    };
  }, [terbuka, onTutup]);

  if (!terbuka) return null;

  const totalHadir = data.reduce((acc, curr) => acc + curr.hadir, 0);
  const totalTerlambat = data.reduce((acc, curr) => acc + curr.terlambat, 0);
  const totalTerlambatMenit = data.reduce((acc, curr) => acc + curr.terlambatMenit, 0);
  const totalPulangCepatMenit = data.reduce((acc, curr) => acc + curr.pulangCepatMenit, 0);
  const totalIzin = data.reduce((acc, curr) => acc + curr.izin, 0);
  const totalSakit = data.reduce((acc, curr) => acc + curr.sakit, 0);
  const totalCuti = data.reduce((acc, curr) => acc + curr.cuti, 0);
  const totalAlpha = data.reduce((acc, curr) => acc + curr.tanpaKeterangan, 0);

  const tanggalCetak = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  function cetak() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Container Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-pratinjau-pdf"
        tabIndex={-1}
        className="relative w-full max-w-5xl rounded-lg bg-white text-neutral-900 shadow-2xl my-auto overscroll-contain"
      >
        {/* Header Aksi (Disembunyikan saat dicetak) */}
        <div className="no-print flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 bg-neutral-50 rounded-t-lg">
          <div>
            <h3 id="judul-pratinjau-pdf" className="font-bold text-sm text-neutral-800">
              Pratinjau Format Cetak PDF Resmi Ber-Kop Desa
            </h3>
            <p className="text-xs text-neutral-500">
              Sesuaikan dengan ukuran kertas A4 (Lanskap) pada menu cetak browser
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={cetak}
              disabled={!siapCetakPejabat}
              className="gap-1.5 text-xs bg-primer text-white hover:bg-primer/90"
            >
              <Printer className="h-4 w-4" />
              <span>Cetak / Simpan PDF</span>
            </Button>
            <Button
              type="button"
              variasi="sekunder"
              onClick={onTutup}
              className="h-8 w-8 p-0"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {pejabatMemuat ? <p role="status" aria-live="polite" className="no-print border-b border-neutral-200 px-5 py-2 text-xs text-neutral-600">Memuat data penandatangan…</p> : null}
        {galatPejabat ? (
          <div role="alert" className="no-print flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs text-amber-900">
            <span>{galatPejabat}</span>
            {onCobaMuatPejabat ? <Button type="button" variasi="sekunder" onClick={onCobaMuatPejabat} className="shrink-0">Coba muat ulang</Button> : null}
          </div>
        ) : null}

        {/* Konten Lembar Dokumen Siap Cetak */}
        <div
          ref={printAreaRef}
          id="area-cetak-rekap-resmi"
          className="p-8 sm:p-12 text-black bg-white max-h-[82vh] overflow-y-auto"
        >
          {/* KOP SURAT PEMERINTAH DESA */}
          <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-1">
            <div className="w-20 shrink-0 flex justify-center">
              <Image
                src="/logo-barru.png"
                alt="Logo Kabupaten Barru"
                width={70}
                height={85}
                className="object-contain"
                priority
              />
            </div>
            <div className="flex-1 text-center font-serif leading-tight">
              <h2 className="text-[17px] sm:text-[19px] font-bold tracking-wider uppercase">
                Pemerintah Kabupaten Barru
              </h2>
              <h3 className="text-[15px] sm:text-[17px] font-bold tracking-wider uppercase">
                Kecamatan Barru
              </h3>
              <h1 className="text-[19px] sm:text-[22px] font-black tracking-widest uppercase">
                Kantor Kepala Desa Anabanua
              </h1>
              <p className="text-[11px] font-sans text-neutral-700 italic mt-0.5">
                Alamat: Jl. Poros Barru - Soppeng, Desa Anabanua, Kec. Barru, Kab. Barru, Sulawesi Selatan 90711
              </p>
            </div>
            <div className="w-20 shrink-0" />
          </div>
          {/* Garis ganda kop surat */}
          <div className="border-b border-black mb-6" />

          {/* JUDUL REKAP */}
          <div className="text-center my-5 space-y-1">
            <h4 className="text-[15px] sm:text-[16px] font-bold uppercase tracking-wide underline underline-offset-4">
              Daftar Rekapitulasi Presensi & Kedisiplinan Perangkat Desa
            </h4>
            <p className="text-xs font-semibold text-neutral-800">
              Periode: Bulan {namaBulan} Tahun {periode.tahun}
            </p>
          </div>

          {/* TABEL REKAPITULASI */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black text-[11px] text-black">
              <thead>
                <tr className="bg-neutral-100 text-center font-bold">
                  <th className="border border-black px-1.5 py-1.5 w-8">No</th>
                  <th className="border border-black px-2 py-1.5 text-left">Nama / NIP/NIK</th>
                  <th className="border border-black px-2 py-1.5 text-left">Jabatan</th>
                  <th className="border border-black px-1.5 py-1.5 w-12">Hadir</th>
                  <th className="border border-black px-1.5 py-1.5 w-14">Terlambat</th>
                  <th className="border border-black px-1.5 py-1.5 w-18">Durasi Lambat</th>
                  <th className="border border-black px-1.5 py-1.5 w-18">Pulang Cepat</th>
                  <th className="border border-black px-1.5 py-1.5 w-10">Izin</th>
                  <th className="border border-black px-1.5 py-1.5 w-10">Sakit</th>
                  <th className="border border-black px-1.5 py-1.5 w-10">Cuti</th>
                  <th className="border border-black px-1.5 py-1.5 w-10">Alpha</th>
                  <th className="border border-black px-1.5 py-1.5 w-14">% Kehadiran</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => {
                  const totalAbsen = row.hadir + row.izin + row.sakit + row.cuti + row.tanpaKeterangan;
                  const persen = totalAbsen > 0 ? Math.round((row.hadir / totalAbsen) * 100) : 100;
                  return (
                    <tr key={row.userId} className="text-center hover:bg-neutral-50">
                      <td className="border border-black px-1.5 py-1.5">{idx + 1}</td>
                      <td className="border border-black px-2 py-1.5 text-left">
                        <div className="font-bold">{row.userName}</div>
                        <div className="text-[10px] text-neutral-600 font-mono">NIP/NIK. {row.employeeId || "—"}</div>
                      </td>
                      <td className="border border-black px-2 py-1.5 text-left">{row.position}</td>
                      <td className="border border-black px-1.5 py-1.5 font-bold">{row.hadir}</td>
                      <td className="border border-black px-1.5 py-1.5">{row.terlambat > 0 ? row.terlambat : "—"}</td>
                      <td className="border border-black px-1.5 py-1.5 text-[10px]">
                        {row.terlambatMenit > 0 ? formatSelisihMenit(row.terlambatMenit) : "—"}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 text-[10px]">
                        {row.pulangCepatMenit > 0 ? formatSelisihMenit(row.pulangCepatMenit) : "—"}
                      </td>
                      <td className="border border-black px-1.5 py-1.5">{row.izin > 0 ? row.izin : "—"}</td>
                      <td className="border border-black px-1.5 py-1.5">{row.sakit > 0 ? row.sakit : "—"}</td>
                      <td className="border border-black px-1.5 py-1.5">{row.cuti > 0 ? row.cuti : "—"}</td>
                      <td className="border border-black px-1.5 py-1.5 font-semibold text-bahaya">
                        {row.tanpaKeterangan > 0 ? row.tanpaKeterangan : "—"}
                      </td>
                      <td className="border border-black px-1.5 py-1.5 font-semibold">{persen}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-100 font-bold text-center">
                  <td colSpan={3} className="border border-black px-2 py-2 text-right">
                    TOTAL KESELURUHAN
                  </td>
                  <td className="border border-black px-1.5 py-2">{totalHadir}</td>
                  <td className="border border-black px-1.5 py-2">{totalTerlambat}</td>
                  <td className="border border-black px-1.5 py-2 text-[10px]">
                    {totalTerlambatMenit > 0 ? formatSelisihMenit(totalTerlambatMenit) : "—"}
                  </td>
                  <td className="border border-black px-1.5 py-2 text-[10px]">
                    {totalPulangCepatMenit > 0 ? formatSelisihMenit(totalPulangCepatMenit) : "—"}
                  </td>
                  <td className="border border-black px-1.5 py-2">{totalIzin}</td>
                  <td className="border border-black px-1.5 py-2">{totalSakit}</td>
                  <td className="border border-black px-1.5 py-2">{totalCuti}</td>
                  <td className="border border-black px-1.5 py-2 text-bahaya">{totalAlpha}</td>
                  <td className="border border-black px-1.5 py-2">
                    {data.length > 0 ? `${Math.round((totalHadir / Math.max(1, totalHadir + totalAlpha)) * 100)}%` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* LEMBAR PENGESAHAN TANDA TANGAN */}
          <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-16">
              <p className="font-semibold">
                Mengetahui,<br />
                Kepala Desa Anabanua
              </p>
              <div>
                <p className="font-bold underline uppercase">{namaKepalaDesa || "—"}</p>
                <p className="text-[11px] text-neutral-600">NIP/NIK. {nipKepalaDesa || "—"}</p>
              </div>
            </div>

            <div className="space-y-16">
              <p className="font-semibold">
                Anabanua, {tanggalCetak}<br />
                Sekretaris Desa Anabanua
              </p>
              <div>
                <p className="font-bold underline uppercase">{namaSekretarisDesa || "—"}</p>
                <p className="text-[11px] text-neutral-600">NIP/NIK. {nipSekretarisDesa || "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS KHUSUS MEDIA CETAK */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #area-cetak-rekap-resmi,
          #area-cetak-rekap-resmi * {
            visibility: visible !important;
          }
          #area-cetak-rekap-resmi {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-height: none !important;
            padding: 10mm 15mm !important;
            margin: 0 !important;
            background: white !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}
