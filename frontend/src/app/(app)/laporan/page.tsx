"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Search,
  X,
  RotateCcw,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { useSession } from "@/providers/session";
import { isAdminRole } from "@/core/domain/user";
import type { MonthlyRecapRow } from "@/core/ports/gateways";
import { formatSelisihMenit } from "@/core/usecase/attendance-status";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { AksesDitolak } from "@/components/admin/akses-ditolak";
import { cn } from "@/lib/cn";
import { amankanSelCsv } from "@/lib/csv";
import { ModalCetakRekapPdf } from "@/features/laporan/modal-cetak-rekap-pdf";


const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type KolomUrut =
  | "nama"
  | "jabatan"
  | "hadir"
  | "terlambat"
  | "terlambatMenit"
  | "pulangCepatMenit"
  | "izin"
  | "sakit"
  | "cuti"
  | "tanpaKeterangan";

type StatusDisiplin =
  | "SEMUA"
  | "DISIPLIN_SEMPURNA"
  | "TERLAMBAT"
  | "PULANG_CEPAT"
  | "ALPHA"
  | "IZIN_CUTI";

/**
 * Durasi selisih dalam kata ("1 jam 25 mnt").
 * "—" dipakai bila tidak ada kejadian.
 */
function durasi(menit: number): string {
  return menit > 0 ? formatSelisihMenit(menit) : "—";
}

function HeaderSortable({
  label,
  kolom,
  urutkan,
  onUrutkan,
  align = "center",
}: {
  label: string;
  kolom: KolomUrut;
  urutkan: { kolom: KolomUrut; arah: "asc" | "desc" };
  onUrutkan: (kolom: KolomUrut) => void;
  align?: "left" | "center";
}) {
  const aktif = urutkan.kolom === kolom;
  return (
    <th
      onClick={() => onUrutkan(kolom)}
      className={cn(
        "label-arsip cursor-pointer select-none px-2 py-3 font-medium transition-colors hover:text-primer",
        align === "center" ? "text-center" : "text-left",
        aktif ? "text-primer font-semibold" : "text-tinta/50",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1",
          align === "center" ? "justify-center" : "justify-start",
        )}
      >
        <span>{label}</span>
        {aktif ? (
          urutkan.arah === "asc" ? (
            <ArrowUp className="h-3 w-3 text-primer shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primer shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-30 hover:opacity-80 shrink-0" />
        )}
      </div>
    </th>
  );
}

export default function HalamanLaporan() {
  const { user, gateways } = useSession();
  const [periode, setPeriode] = useState(() => {
    const kini = new Date();
    return { tahun: kini.getFullYear(), bulan: kini.getMonth() + 1 };
  });
  const [baris, setBaris] = useState<MonthlyRecapRow[]>([]);
  const [pejabat, setPejabat] = useState<{ namaKepalaDesa: string; nipKepalaDesa: string; namaSekretarisDesa: string; nipSekretarisDesa: string }>();
  const [galatPejabat, setGalatPejabat] = useState<string | null>(null);
  const [pejabatMemuat, setPejabatMemuat] = useState(false);
  const [cobaPejabat, setCobaPejabat] = useState(0);
  const [memuat, setMemuat] = useState(false);

  // State Filter Canggih
  const [cari, setCari] = useState("");
  const [filterJabatan, setFilterJabatan] = useState("SEMUA");
  const [filterStatus, setFilterStatus] = useState<StatusDisiplin>("SEMUA");
  const [urutkan, setUrutkan] = useState<{ kolom: KolomUrut; arah: "asc" | "desc" }>({
    kolom: "nama",
    arah: "asc",
  });
  const [bukaModalPdf, setBukaModalPdf] = useState(false);

  const muat = useCallback(async () => {
    if (!user || !isAdminRole(user.role)) return;
    setMemuat(true);
    try {
      setBaris(await gateways.admin.getMonthlyRecap(periode.tahun, periode.bulan));
    } finally {
      setMemuat(false);
    }
  }, [user, gateways, periode]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  useEffect(() => {
    if (!user || !isAdminRole(user.role)) return;
    let usang = false;
    setGalatPejabat(null);
    setPejabatMemuat(true);
    void gateways.admin.listAllUsers().then((users) => {
      if (usang) return;
      const kepala = users.find((p) => p.role === "KEPALA_DESA");
      const sekretaris = users.find((p) => p.role === "SEKRETARIS_DESA");
      setPejabat({
        namaKepalaDesa: kepala?.fullName ?? "",
        nipKepalaDesa: kepala?.official.employeeId ?? "",
        namaSekretarisDesa: sekretaris?.fullName ?? "",
        nipSekretarisDesa: sekretaris?.official.employeeId ?? "",
      });
      if (!kepala?.fullName || !kepala.official.employeeId || !sekretaris?.fullName || !sekretaris.official.employeeId) {
        setGalatPejabat("Nama atau NIP/NIK pejabat belum lengkap. Perbarui data pejabat sebelum mencetak laporan resmi.");
      }
    }).catch(() => {
      if (!usang) {
        setPejabat(undefined);
        setGalatPejabat("Data pejabat penandatangan gagal dimuat. Periksa koneksi lalu coba muat ulang.");
      }
    }).finally(() => {
      if (!usang) setPejabatMemuat(false);
    });
    return () => { usang = true; };
  }, [user, gateways, cobaPejabat]);

  const cobaMuatPejabatLagi = useCallback(() => setCobaPejabat((n) => n + 1), []);
  const tutupModalPdf = useCallback(() => setBukaModalPdf(false), []);

  // Daftar jabatan unik dari dataset yang ada
  const daftarJabatan = useMemo(() => {
    const set = new Set<string>();
    baris.forEach((b) => {
      if (b.position) set.add(b.position);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baris]);

  // Handler Pengurutan Kolom
  const toggleUrutkan = (kolom: KolomUrut) => {
    setUrutkan((saatIni) => {
      if (saatIni.kolom === kolom) {
        return { kolom, arah: saatIni.arah === "asc" ? "desc" : "asc" };
      }
      return { kolom, arah: kolom === "nama" || kolom === "jabatan" ? "asc" : "desc" };
    });
  };

  // Cek apakah ada filter yang sedang aktif
  const filterAktif = cari.trim() !== "" || filterJabatan !== "SEMUA" || filterStatus !== "SEMUA";

  const resetFilter = () => {
    setCari("");
    setFilterJabatan("SEMUA");
    setFilterStatus("SEMUA");
    setUrutkan({ kolom: "nama", arah: "asc" });
  };

  // Pintasan Periode Cepat
  const pilihBulanIni = () => {
    const kini = new Date();
    setPeriode({ tahun: kini.getFullYear(), bulan: kini.getMonth() + 1 });
  };

  const pilihBulanLalu = () => {
    const kini = new Date();
    let thn = kini.getFullYear();
    let bln = kini.getMonth(); // 0-indexed bulan sekarang = nilai 1-indexed bulan lalu
    if (bln === 0) {
      bln = 12;
      thn -= 1;
    }
    setPeriode({ tahun: thn, bulan: bln });
  };

  // Penerapan Filter dan Pengurutan
  const dataTerfilter = useMemo(() => {
    let hasil = [...baris];

    // 1. Filter Pencarian Nama / NIP / Jabatan
    if (cari.trim()) {
      const q = cari.toLowerCase().trim();
      hasil = hasil.filter(
        (b) =>
          b.userName.toLowerCase().includes(q) ||
          b.userId.toLowerCase().includes(q) ||
          b.position.toLowerCase().includes(q),
      );
    }

    // 2. Filter Jabatan
    if (filterJabatan !== "SEMUA") {
      hasil = hasil.filter((b) => b.position === filterJabatan);
    }

    // 3. Filter Status Kedisiplinan
    if (filterStatus === "DISIPLIN_SEMPURNA") {
      hasil = hasil.filter(
        (b) => b.terlambat === 0 && b.tanpaKeterangan === 0 && b.pulangCepatMenit === 0 && b.hadir > 0,
      );
    } else if (filterStatus === "TERLAMBAT") {
      hasil = hasil.filter((b) => b.terlambat > 0);
    } else if (filterStatus === "PULANG_CEPAT") {
      hasil = hasil.filter((b) => b.pulangCepatMenit > 0);
    } else if (filterStatus === "ALPHA") {
      hasil = hasil.filter((b) => b.tanpaKeterangan > 0);
    } else if (filterStatus === "IZIN_CUTI") {
      hasil = hasil.filter((b) => b.izin + b.sakit + b.cuti > 0);
    }

    // 4. Pengurutan Data
    hasil.sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;

      switch (urutkan.kolom) {
        case "nama":
          valA = a.userName.toLowerCase();
          valB = b.userName.toLowerCase();
          break;
        case "jabatan":
          valA = a.position.toLowerCase();
          valB = b.position.toLowerCase();
          break;
        case "hadir":
          valA = a.hadir;
          valB = b.hadir;
          break;
        case "terlambat":
          valA = a.terlambat;
          valB = b.terlambat;
          break;
        case "terlambatMenit":
          valA = a.terlambatMenit;
          valB = b.terlambatMenit;
          break;
        case "pulangCepatMenit":
          valA = a.pulangCepatMenit;
          valB = b.pulangCepatMenit;
          break;
        case "izin":
          valA = a.izin;
          valB = b.izin;
          break;
        case "sakit":
          valA = a.sakit;
          valB = b.sakit;
          break;
        case "cuti":
          valA = a.cuti;
          valB = b.cuti;
          break;
        case "tanpaKeterangan":
          valA = a.tanpaKeterangan;
          valB = b.tanpaKeterangan;
          break;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return urutkan.arah === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return urutkan.arah === "asc"
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

    return hasil;
  }, [baris, cari, filterJabatan, filterStatus, urutkan]);

  // Statistik Ringkas Dinamis Sesuai Filter
  const totalAparat = dataTerfilter.length;
  const totalHadir = dataTerfilter.reduce((acc, curr) => acc + curr.hadir, 0);
  const totalTerlambatKali = dataTerfilter.reduce((acc, curr) => acc + curr.terlambat, 0);
  const totalTerlambatMenit = dataTerfilter.reduce((acc, curr) => acc + curr.terlambatMenit, 0);
  const totalAlpha = dataTerfilter.reduce((acc, curr) => acc + curr.tanpaKeterangan, 0);
  const totalIzinCuti = dataTerfilter.reduce(
    (acc, curr) => acc + curr.izin + curr.sakit + curr.cuti,
    0,
  );

  if (!user) return null;
  if (!isAdminRole(user.role)) return <AksesDitolak />;

  function eksporCsv() {
    const dataEkspor = dataTerfilter;
    const kepala = [
      "NIP/NIK", "Nama", "Jabatan", "Hadir", "Terlambat", "Durasi Terlambat",
      "Pulang Cepat", "Izin", "Sakit", "Cuti", "Tanpa Keterangan",
    ];
    const isi = dataEkspor.map((b) =>
      [
        b.employeeId,
        b.userName,
        b.position,
        b.hadir,
        b.terlambat,
        durasi(b.terlambatMenit),
        durasi(b.pulangCepatMenit),
        b.izin,
        b.sakit,
        b.cuti,
        b.tanpaKeterangan,
      ]
        .map(amankanSelCsv)
        .join(";"),
    );
    const filterInfo = filterAktif ? "-tersaring" : "";
    const csv = "\uFEFF" + [kepala.join(";"), ...isi].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-presensi-${periode.tahun}-${String(periode.bulan).padStart(2, "0")}${filterInfo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <JudulHalaman
        judul="Laporan Rekap Bulanan"
        kode="Administrasi"
        sub="Rekapitulasi kehadiran perangkat desa per periode"
        aksi={
          <div className="flex items-center gap-2">
            <Select
              className="h-9 w-auto text-[13px]"
              value={periode.bulan}
              onChange={(e) => setPeriode((p) => ({ ...p, bulan: Number(e.target.value) }))}
              aria-label="Pilih Bulan"
            >
              {BULAN.map((b, i) => (
                <option key={b} value={i + 1}>{b}</option>
              ))}
            </Select>
            <Select
              className="h-9 w-auto text-[13px]"
              value={periode.tahun}
              onChange={(e) => setPeriode((p) => ({ ...p, tahun: Number(e.target.value) }))}
              aria-label="Pilih Tahun"
            >
              {[periode.tahun - 2, periode.tahun - 1, periode.tahun, periode.tahun + 1].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Button
              variasi="sekunder"
              className="h-9 gap-1.5 text-[13px]"
              onClick={eksporCsv}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Ekspor CSV</span>
            </Button>
            <Button
              variasi="utama"
              className="h-9 gap-1.5 text-[13px]"
              onClick={() => setBukaModalPdf(true)}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak PDF Resmi</span>
            </Button>
          </div>
        }
      />

      {/* Ringkasan Metrik */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="slip p-3.5">
          <div className="flex items-center justify-between">
            <span className="label-arsip text-[10px] text-tinta/50">Aparat Terdata</span>
            <Users className="h-4 w-4 text-primer" />
          </div>
          <p className="angka-ukur mt-1 text-2xl font-bold text-tinta">
            {totalAparat}
            <span className="ml-1 text-xs font-normal text-tinta/45">/ {baris.length}</span>
          </p>
        </div>
        <div className="slip p-3.5">
          <div className="flex items-center justify-between">
            <span className="label-arsip text-[10px] text-tinta/50">Total Hadir</span>
            <CheckCircle2 className="h-4 w-4 text-primer" />
          </div>
          <p className="angka-ukur mt-1 text-2xl font-bold text-primer">
            {totalHadir}
            <span className="ml-1 text-xs font-normal text-tinta/45">hari</span>
          </p>
        </div>
        <div className="slip p-3.5">
          <div className="flex items-center justify-between">
            <span className="label-arsip text-[10px] text-tinta/50">Keterlambatan</span>
            <Clock className="h-4 w-4 text-bahaya" />
          </div>
          <p className="angka-ukur mt-1 text-2xl font-bold text-bahaya">
            {totalTerlambatKali}
            <span className="ml-1 text-xs font-normal text-tinta/45">
              kali ({durasi(totalTerlambatMenit)})
            </span>
          </p>
        </div>
        <div className="slip p-3.5">
          <div className="flex items-center justify-between">
            <span className="label-arsip text-[10px] text-tinta/50">Alpha</span>
            <AlertTriangle className="h-4 w-4 text-bahaya" />
          </div>
          <p className="angka-ukur mt-1 text-2xl font-bold text-bahaya">
            {totalAlpha}
            <span className="ml-1 text-xs font-normal text-tinta/45">hari</span>
          </p>
        </div>
      </div>

      {/* Panel Filter */}
      <div className="mb-4 rounded-xl border border-garis-folio bg-putih p-4">
        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primer" />
            <span className="text-sm font-semibold text-tinta">Filter</span>
            {filterAktif && (
              <Badge nada="primer" className="text-[10.5px]">
                {dataTerfilter.length} hasil
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pilihBulanIni}
              className="rounded-md border border-garis px-2.5 py-1 text-[11.5px] font-medium text-tinta/70 transition-colors hover:bg-folio hover:text-tinta"
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={pilihBulanLalu}
              className="rounded-md border border-garis px-2.5 py-1 text-[11.5px] font-medium text-tinta/70 transition-colors hover:bg-folio hover:text-tinta"
            >
              Bulan Lalu
            </button>
            {filterAktif && (
              <button
                type="button"
                onClick={resetFilter}
                className="flex items-center gap-1 rounded-md border border-bahaya/30 bg-bahaya/5 px-2.5 py-1 text-[11.5px] font-medium text-bahaya transition-colors hover:bg-bahaya/15"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t border-garis-folio pt-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Pencarian */}
          <div>
            <span className="label-arsip mb-1 block text-[10px] text-tinta/50">Cari Perangkat</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta/40" />
              <Input
                type="text"
                placeholder="Nama atau NIP..."
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                className="h-9 pl-8 pr-7 text-[13px]"
              />
              {cari && (
                <button
                  type="button"
                  onClick={() => setCari("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-tinta/40 hover:text-tinta"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Jabatan */}
          <div>
            <span className="label-arsip mb-1 block text-[10px] text-tinta/50">Jabatan</span>
            <Select
              value={filterJabatan}
              onChange={(e) => setFilterJabatan(e.target.value)}
              className="h-9 text-[13px]"
            >
              <option value="SEMUA">Semua Jabatan</option>
              {daftarJabatan.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </Select>
          </div>

          {/* Kategori Disiplin */}
          <div>
            <span className="label-arsip mb-1 block text-[10px] text-tinta/50">Kategori Disiplin</span>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StatusDisiplin)}
              className="h-9 text-[13px]"
            >
              <option value="SEMUA">Semua Kategori</option>
              <option value="DISIPLIN_SEMPURNA">Disiplin Penuh</option>
              <option value="TERLAMBAT">Ada Keterlambatan</option>
              <option value="PULANG_CEPAT">Ada Pulang Cepat</option>
              <option value="ALPHA">Ada Tanpa Keterangan</option>
              <option value="IZIN_CUTI">Ada Izin / Sakit / Cuti</option>
            </Select>
          </div>

          {/* Pengurutan */}
          <div>
            <span className="label-arsip mb-1 block text-[10px] text-tinta/50">Urutkan</span>
            <div className="flex gap-1.5">
              <Select
                value={urutkan.kolom}
                onChange={(e) => setUrutkan((u) => ({ ...u, kolom: e.target.value as KolomUrut }))}
                className="h-9 flex-1 text-[13px]"
              >
                <option value="nama">Nama</option>
                <option value="jabatan">Jabatan</option>
                <option value="hadir">Hari Hadir</option>
                <option value="terlambat">Frek. Terlambat</option>
                <option value="terlambatMenit">Durasi Terlambat</option>
                <option value="pulangCepatMenit">Pulang Cepat</option>
                <option value="tanpaKeterangan">Tanpa Keterangan</option>
              </Select>
              <button
                type="button"
                onClick={() => setUrutkan((u) => ({ ...u, arah: u.arah === "asc" ? "desc" : "asc" }))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-kendali border border-garis bg-folio text-tinta transition-colors hover:bg-putih"
                title={urutkan.arah === "asc" ? "Menaik" : "Menurun"}
              >
                {urutkan.arah === "asc" ? (
                  <ArrowUp className="h-4 w-4 text-primer" />
                ) : (
                  <ArrowDown className="h-4 w-4 text-primer" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tag Filter Aktif */}
        {filterAktif && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-garis-folio pt-2.5 text-[11.5px]">
            <span className="text-tinta/45">Filter aktif:</span>
            {cari.trim() && (
              <span className="inline-flex items-center gap-1 rounded-full border border-garis bg-folio px-2 py-0.5 text-tinta/75">
                &quot;{cari}&quot;
                <button type="button" onClick={() => setCari("")} className="hover:text-bahaya">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filterJabatan !== "SEMUA" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-garis bg-folio px-2 py-0.5 text-tinta/75">
                {filterJabatan}
                <button type="button" onClick={() => setFilterJabatan("SEMUA")} className="hover:text-bahaya">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filterStatus !== "SEMUA" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-garis bg-folio px-2 py-0.5 text-tinta/75">
                {filterStatus.replaceAll("_", " ").toLowerCase()}
                <button type="button" onClick={() => setFilterStatus("SEMUA")} className="hover:text-bahaya">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabel Rekapitulasi */}
      <Card>
        <CardHeader
          title={`Rekap ${BULAN[periode.bulan - 1]} ${periode.tahun}`}
          sub={
            filterAktif
              ? `${dataTerfilter.length} dari ${baris.length} perangkat desa`
              : `${baris.length} perangkat desa`
          }
        />
        <div className="overflow-x-auto scroll-halus">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-garis bg-meja/40">
                <HeaderSortable label="Nama" kolom="nama" urutkan={urutkan} onUrutkan={toggleUrutkan} align="left" />
                <HeaderSortable label="Jabatan" kolom="jabatan" urutkan={urutkan} onUrutkan={toggleUrutkan} align="left" />
                <HeaderSortable label="Hadir" kolom="hadir" urutkan={urutkan} onUrutkan={toggleUrutkan} />
                <HeaderSortable label="Terlambat" kolom="terlambat" urutkan={urutkan} onUrutkan={toggleUrutkan} />
                <HeaderSortable label="Durasi Lambat" kolom="terlambatMenit" urutkan={urutkan} onUrutkan={toggleUrutkan} />
                <HeaderSortable label="Pulang Cepat" kolom="pulangCepatMenit" urutkan={urutkan} onUrutkan={toggleUrutkan} />
                <th className="label-arsip px-2 py-2.5 text-center font-medium text-tinta/50">Izin</th>
                <th className="label-arsip px-2 py-2.5 text-center font-medium text-tinta/50">Sakit</th>
                <th className="label-arsip px-2 py-2.5 text-center font-medium text-tinta/50">Cuti</th>
                <HeaderSortable label="Alpha" kolom="tanpaKeterangan" urutkan={urutkan} onUrutkan={toggleUrutkan} />
              </tr>
            </thead>
            <tbody>
              {memuat ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-tinta/50">
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : dataTerfilter.map((b) => (
                <tr
                  key={b.userId}
                  className="border-b border-garis-folio transition-colors last:border-0 hover:bg-folio-2/50"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-tinta">{b.userName}</p>
                    <p className="angka-ukur text-[11px] text-tinta/40">{b.userId}</p>
                  </td>
                  <td className="px-2 py-2.5 text-tinta/65">
                    <span className="rounded border border-garis bg-folio px-1.5 py-0.5 text-[12px]">
                      {b.position}
                    </span>
                  </td>
                  <td className="angka-ukur px-2 py-2.5 text-center font-bold text-primer">
                    {b.hadir}
                  </td>
                  <td className={cn("angka-ukur px-2 py-2.5 text-center", b.terlambat > 0 ? "font-bold text-bahaya" : "text-tinta/30")}>
                    {b.terlambat}
                  </td>
                  <td className={cn("angka-ukur px-2 py-2.5 text-center", b.terlambatMenit > 0 ? "font-semibold text-bahaya" : "text-tinta/30")}>
                    {durasi(b.terlambatMenit)}
                  </td>
                  <td className={cn("angka-ukur px-2 py-2.5 text-center", b.pulangCepatMenit > 0 ? "font-semibold text-peringatan" : "text-tinta/30")}>
                    {durasi(b.pulangCepatMenit)}
                  </td>
                  <td className="angka-ukur px-2 py-2.5 text-center text-tinta/65">{b.izin > 0 ? b.izin : "—"}</td>
                  <td className="angka-ukur px-2 py-2.5 text-center text-tinta/65">{b.sakit > 0 ? b.sakit : "—"}</td>
                  <td className="angka-ukur px-2 py-2.5 text-center text-tinta/65">{b.cuti > 0 ? b.cuti : "—"}</td>
                  <td className={cn("angka-ukur px-2 py-2.5 text-center", b.tanpaKeterangan > 0 ? "font-bold text-bahaya" : "text-tinta/30")}>
                    {b.tanpaKeterangan > 0 ? b.tanpaKeterangan : "—"}
                  </td>
                </tr>
              ))}

              {!memuat && dataTerfilter.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center">
                      <FileSpreadsheet className="h-8 w-8 text-tinta/25" />
                      <p className="mt-2 text-sm font-medium text-tinta">
                        {filterAktif ? "Tidak ada data yang cocok" : "Belum ada data"}
                      </p>
                      <p className="mt-0.5 text-xs text-tinta/45">
                        {filterAktif
                          ? "Coba ubah kriteria filter Anda."
                          : "Belum ada catatan presensi pada periode ini."}
                      </p>
                      {filterAktif && (
                        <Button
                          variasi="sekunder"
                          onClick={resetFilter}
                          className="mt-3 gap-1.5 text-xs"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reset Filter</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ModalCetakRekapPdf
        terbuka={bukaModalPdf}
        onTutup={tutupModalPdf}
        periode={periode}
        namaBulan={BULAN[periode.bulan - 1]}
        data={dataTerfilter}
        galatPejabat={galatPejabat}
        pejabatMemuat={pejabatMemuat}
        siapCetakPejabat={Boolean(pejabat && !galatPejabat && !pejabatMemuat)}
        onCobaMuatPejabat={cobaMuatPejabatLagi}
        {...pejabat}
      />
    </>
  );
}
