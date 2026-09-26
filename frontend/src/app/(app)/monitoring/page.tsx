"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarOff, ClipboardCheck, ScanFace } from "lucide-react";
import { useSession } from "@/providers/session";
import { isAdminRole } from "@/core/domain/user";
import type { AttendanceListItem, WorkSchedule } from "@/core/domain/attendance";
import type { RingkasanMonitoring } from "@/core/domain/monitoring";
import type { HariLibur } from "@/core/domain/libur";
import { kalenderLibur } from "@/core/domain/libur";
import { ringkasMonitoring } from "@/core/usecase/monitoring";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jam, tanggalPanjang, tanggalISO } from "@/lib/waktu";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_TYPE_LABEL,
} from "@/core/domain/attendance";
import { kalimatSelisihBarisAdmin, ringkasanSelisihBarisAdmin, ringkasSelisih } from "@/core/usecase/attendance-status";
import { AksesDitolak } from "@/components/admin/akses-ditolak";
import type { MonthlyRecapRow } from "@/core/ports/gateways";
import {
  GrafikTrenKedisiplinan,
  type DataBulanTren,
} from "@/features/dashboard/grafik-tren";

export default function HalamanMonitoring() {
  const { user, gateways } = useSession();
  const [ringkasan, setRingkasan] = useState<RingkasanMonitoring | null>(null);
  const [aktivitas, setAktivitas] = useState<AttendanceListItem[]>([]);
  const [libur, setLibur] = useState<HariLibur[]>([]);
  // Jadwal berlaku: dipakai menerjemahkan status "TERLAMBAT"/"PULANG_CEPAT"
  // menjadi durasi — "terlambat 25 mnt", "pulang cepat 1 jam".
  const [jadwal, setJadwal] = useState<WorkSchedule | null>(null);
  const [menunggu, setMenunggu] = useState({ wajah: 0, pengajuan: 0 });

  useEffect(() => {
    if (!user || !isAdminRole(user.role)) return;
    void (async () => {
      const tanggal = tanggalISO(new Date());
      const tahun = Number(tanggal.slice(0, 4));
      // Halaman ini hanya memanggil API fitur yang sudah ada — pengguna,
      // presensi harian, pengajuan, enrollment, konfigurasi jadwal, dan kalender
      // hari libur. Tidak ada endpoint khusus dashboard: agregatnya dihitung di
      // core (ringkasMonitoring), termasuk beda "belum presensi",
      // "tanpa keterangan", dan hari libur yang tidak menuntut presensi.
      const [pengguna, presensi, disetujui, wajah, pengajuanMenunggu, cfg, kalender] =
        await Promise.all([
          gateways.admin.listAllUsers(),
          gateways.admin.listAttendance({ date: tanggal }),
          gateways.admin.listAllRequests("DISETUJUI"),
          gateways.admin.listPendingEnrollments(),
          gateways.admin.listAllRequests("MENUNGGU"),
          gateways.attendance.getActiveConfig(),
          gateways.libur.tahun(tahun),
        ]);
      setRingkasan(
        ringkasMonitoring({
          tanggal,
          pengguna,
          presensi,
          pengajuan: disetujui,
          jadwal: cfg.schedule,
          libur: kalenderLibur(kalender),
          sekarang: new Date(),
        }),
      );
      setAktivitas(presensi);
      setLibur(kalender);
      setJadwal(cfg.schedule);
      setMenunggu({
        wajah: wajah.length,
        pengajuan: pengajuanMenunggu.length,
      });
    })();
  }, [user, gateways]);

  if (!user) return null;
  if (!isAdminRole(user.role)) return <AksesDitolak />;
  if (!ringkasan) {
    return (
      <div className="label-arsip flex h-64 items-center justify-center gap-2 text-tinta/50">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
        Memuat monitoring…
      </div>
    );
  }

  const liburHariIni = libur.find((h) => h.tanggal === tanggalISO(new Date()));
  // Total durasi keterlambatan hari ini — pelengkap angka "N terlambat" pada
  // kartu ringkas: jumlah kejadian saja tidak mengatakan seberapa lama.
  const totalTerlambat = ringkasSelisih(
    ringkasan.terlambat,
    ringkasanSelisihBarisAdmin(aktivitas, jadwal).terlambatMenit,
  );

  return (
    <>
      <JudulHalaman
        judul="Monitoring kehadiran"
        kode="Administrasi"
        sub={tanggalPanjang(new Date())}
        aksi={
          <div className="flex gap-2">
            <TautanAdmin href="/verifikasi-wajah" ikon={<ScanFace className="h-4 w-4 text-primer" />} label="Verifikasi wajah" jumlah={menunggu.wajah} />
            <TautanAdmin href="/persetujuan" ikon={<ClipboardCheck className="h-4 w-4 text-primer" />} label="Persetujuan" jumlah={menunggu.pengajuan} />
          </div>
        }
      />

      {liburHariIni ? (
        <p className="label-arsip mb-3 flex items-center gap-2 rounded-tanda border border-info/25 bg-info/8 px-3 py-2 text-info">
          <CalendarOff className="h-4 w-4" />
          Hari libur — {liburHariIni.nama}. Presensi tidak diwajibkan, jadi tidak
          ada perangkat yang dihitung tanpa keterangan hari ini.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Stat nilai={ringkasan.hadir} label="hadir" nada="primer" />
        <Stat nilai={ringkasan.belumPresensi} label="belum presensi" nada="netral" />
        {ringkasan.tutupBuku ? (
          <Stat nilai={ringkasan.tanpaKeterangan} label="tanpa keterangan" nada="bahaya" />
        ) : null}
        <Stat nilai={ringkasan.terlambat} label="terlambat" nada="bahaya" />
        <Stat nilai={ringkasan.wfh} label="WFH" nada="info" />
        <Stat nilai={ringkasan.dinasLuar} label="dinas luar" nada="info" />
        <Stat nilai={ringkasan.izinSakitCuti} label="izin/sakit/cuti" nada="peringatan" />
      </div>

      {ringkasan.tutupBuku && ringkasan.daftarTanpaKeterangan.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Tanpa keterangan"
            sub={`${ringkasan.daftarTanpaKeterangan.length} perangkat belum presensi dan tanpa izin/sakit/cuti disetujui`}
          />
          <ul className="divide-y divide-garis">
            {ringkasan.daftarTanpaKeterangan.map((p) => (
              <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <p className="w-44 text-[13.5px] font-semibold">{p.userName}</p>
                <p className="w-40 text-[12.5px] text-tinta/55">{p.position}</p>
                <Badge nada="bahaya">Tanpa keterangan</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title="Aktivitas hari ini"
          sub={
            totalTerlambat
              ? `${aktivitas.length} transaksi tercatat · keterlambatan hari ini ${totalTerlambat}`
              : `${aktivitas.length} transaksi tercatat`
          }
        />
        {aktivitas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-tinta/50">
            Belum ada transaksi presensi hari ini.
          </p>
        ) : (
          <ul className="divide-y divide-garis">
            {aktivitas.slice(0, 12).map((a) => {
              // "terlambat 25 mnt dari batas masuk 08:00", "pulang cepat 1 jam
              // dari jam pulang 16:00" — angka, bukan hanya label status, supaya
              // atasan tahu seberapa jauh penyimpangannya.
              const selisih = kalimatSelisihBarisAdmin(a, jadwal);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <p className="w-44 text-[13.5px] font-semibold">{a.userName}</p>
                  <p className="w-40 text-[12.5px] text-tinta/55">{a.position}</p>
                  <Badge nada={a.type === "CHECK_IN" ? "primer" : "info"}>
                    {ATTENDANCE_TYPE_LABEL[a.type]}
                  </Badge>
                  <p className="angka-ukur text-[15px] font-semibold">{jam(a.at)}</p>
                  <Badge
                    nada={a.status === "TERLAMBAT" ? "bahaya" : a.status === "PULANG_CEPAT" ? "peringatan" : "netral"}
                  >
                    {ATTENDANCE_STATUS_LABEL[a.status]}
                  </Badge>
                  {selisih ? (
                    <span
                      className={
                        a.status === "PULANG_CEPAT"
                          ? "text-[12px] font-medium text-peringatan"
                          : "text-[12px] font-medium text-bahaya"
                      }
                    >
                      {selisih}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-tinta/40">
                    {Math.round(a.distanceMeters)} m
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function TautanAdmin({
  href,
  ikon,
  label,
  jumlah,
}: {
  href: string;
  ikon: React.ReactNode;
  label: string;
  jumlah: number;
}) {
  return (
    <Link
      href={href}
      className="slip inline-flex h-10 items-center gap-2 px-3.5 text-[13px] font-semibold transition-shadow hover:shadow-lembar"
    >
      {ikon} {label}
      {jumlah > 0 ? (
        <span className="angka-ukur rounded-full bg-peringatan/15 px-2 py-0.5 text-[11px] font-semibold text-peringatan">
          {jumlah}
        </span>
      ) : null}
    </Link>
  );
}

function Stat({
  nilai,
  label,
  nada,
}: {
  nilai: number;
  label: string;
  nada: "primer" | "bahaya" | "peringatan" | "info" | "netral";
}) {
  const nadaLabel: Record<string, string> = {
    primer: "text-primer",
    bahaya: "text-bahaya",
    peringatan: "text-peringatan",
    info: "text-info",
    netral: "text-tinta/45",
  };
  const nadaPita: Record<string, string> = {
    primer: "bg-primer",
    bahaya: "bg-bahaya",
    peringatan: "bg-peringatan",
    info: "bg-info",
    netral: "bg-tinta/20",
  };
  return (
    <div className="slip overflow-hidden px-4 py-3.5">
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-[3px] ${nadaPita[nada]}`}
      />
      <p className="angka-ukur text-[26px] font-semibold leading-none tracking-[-0.02em] text-tinta">
        {nilai}
      </p>
      <p className={`label-arsip mt-2 ${nadaLabel[nada]}`}>{label}</p>
    </div>
  );
}
