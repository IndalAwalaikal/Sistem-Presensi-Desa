"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/providers/session";
import { isAdminRole } from "@/core/domain/user";
import type {
  Attendance,
  TodayStatus,
  WorkSchedule,
} from "@/core/ports/gateways";
import type { WorkRequest } from "@/core/domain/requests";
import type { HariLibur } from "@/core/domain/libur";
import { kalenderLibur } from "@/core/domain/libur";
import { hariKerjaBulan } from "@/core/usecase/kehadiran";
import { ringkasanSelisih, ringkasSelisih } from "@/core/usecase/attendance-status";
import { tanggalISO } from "@/lib/waktu";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Badge } from "@/components/ui/badge";
import { KartuStatus } from "@/features/dashboard/kartu-status";
import { AktivitasTerakhir } from "@/features/dashboard/aktivitas-terakhir";
import {
  KartuProgres,
  Stat,
  TautanCepat,
} from "@/features/dashboard/kartu-ringkas";

export default function HalamanDashboard() {
  const { user, gateways } = useSession();
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [bulanIni, setBulanIni] = useState<Attendance[]>([]);
  const [pengajuan, setPengajuan] = useState<WorkRequest[]>([]);
  const [jadwal, setJadwal] = useState<WorkSchedule | null>(null);
  const [libur, setLibur] = useState<HariLibur[]>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [s, riwayat, reqs, cfg, kalender] = await Promise.all([
        gateways.attendance.getTodayStatus(user.id),
        gateways.attendance.listMine(),
        gateways.request.listMine(user.id),
        gateways.attendance.getActiveConfig(),
        // Kalender hari libur tahun berjalan — supaya jumlah hari kerja pada
        // kartu ringkas mengikuti kalender asli (libur nasional, cuti bersama,
        // libur lokal), bukan sekadar "bukan Minggu".
        gateways.libur.tahun(new Date().getFullYear()),
      ]);
      setStatus(s);
      setBulanIni(riwayat);
      setPengajuan(reqs);
      setJadwal(cfg.schedule);
      setLibur(kalender);
    })();
  }, [user, gateways]);

  if (!user || !status) {
    return (
      <div className="label-arsip flex h-64 items-center justify-center gap-2 text-tinta/50">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
        Memuat dashboard…
      </div>
    );
  }

  const kini = tanggalISO(new Date());
  const checkInsBulan = bulanIni.filter(
    (a) =>
      a.type === "CHECK_IN" &&
      // Waktu server berbentuk ISO UTC: dinormalkan ke WITA lebih dulu, supaya
      // presensi pagi (sebelum 08:00 WITA) tidak jatuh ke bulan sebelumnya.
      tanggalISO(a.verification.serverTime).slice(0, 7) === kini.slice(0, 7),
  );
  const hadir = checkInsBulan.length;
  const terlambat = checkInsBulan.filter((a) => a.status === "TERLAMBAT").length;
  const izinSetuju = pengajuan.filter(
    (r) =>
      r.status === "DISETUJUI" &&
      r.type !== "WFH" &&
      r.type !== "DINAS_LUAR" &&
      r.startDate.slice(0, 7) === kini.slice(0, 7),
  ).length;
  const menunggu = pengajuan.filter((r) => r.status === "MENUNGGU").length;
  // Penyebut "hari hadir": hari kerja efektif bulan berjalan sampai hari ini,
  // menurut jadwal kantor dan kalender hari libur — bukan sekadar "bukan Minggu".
  const hariKerja = jadwal
    ? hariKerjaBulan(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        jadwal,
        kalenderLibur(libur),
        kini,
      ).length
    : 0;
  const liburHariIni = libur.find((h) => h.tanggal === kini);
  // Durasi, bukan hanya jumlah kejadian: "3 kali terlambat" menjadi berarti
  // setelah disebut "total 1 jam 25 mnt".
  const totalTerlambat = ringkasSelisih(
    terlambat,
    ringkasanSelisih(bulanIni, jadwal).terlambatMenit,
  );
  const namaDepan = user.fullName.split(" ")[0];

  return (
    <>
      <JudulHalaman
        judul={`Halo, ${namaDepan}`}
        kode="Ringkasan pribadi"
        sub={`${user.official.position} · ${user.official.unit}`}
        aksi={
          liburHariIni ? (
            <Badge nada="info">
              Hari libur — {liburHariIni.nama}
            </Badge>
          ) : null
        }
      />

      <KartuStatus status={status} jadwal={jadwal} />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          nilai={`${hadir}`}
          total={hariKerja}
          label="hari hadir"
          sub="bulan ini"
          nada="primer"
        />
        <Stat
          nilai={`${terlambat}`}
          label="kali terlambat"
          sub={totalTerlambat ? `bulan ini · ${totalTerlambat}` : "bulan ini"}
          nada={terlambat > 0 ? "bahaya" : "netral"}
        />
        <Stat nilai={`${izinSetuju}`} label="izin / cuti" sub="disetujui bulan ini" />
        <Stat
          nilai={`${menunggu}`}
          label="menunggu"
          sub="pengajuan"
          nada={menunggu > 0 ? "peringatan" : "netral"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AktivitasTerakhir items={bulanIni} jadwal={jadwal} />
        </div>
        <div className="space-y-5">
          <KartuProgres hadir={hadir} target={hariKerja} />
          <TautanCepat tampilAdmin={isAdminRole(user.role)} />
        </div>
      </div>
    </>
  );
}
