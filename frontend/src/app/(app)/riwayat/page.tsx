"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/providers/session";
import type { Attendance, WorkSchedule } from "@/core/ports/gateways";
import type { WorkRequest } from "@/core/domain/requests";
import type { HariLibur } from "@/core/domain/libur";
import { kalenderLibur, petaNamaLibur } from "@/core/domain/libur";
import { hariDijelaskan, hariKerjaTertutup } from "@/core/usecase/kehadiran";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_TYPE_LABEL,
} from "@/core/domain/attendance";
import { KalenderBulan } from "@/features/riwayat/kalender-bulan";
import { jam, tanggalPanjang, tanggalISO } from "@/lib/waktu";
import {
  kalimatSelisihTransaksi,
  ringkasanSelisih,
  ringkasSelisih,
} from "@/core/usecase/attendance-status";

export default function HalamanRiwayat() {
  const { user, gateways } = useSession();
  const [items, setItems] = useState<Attendance[] | null>(null);
  const [pengajuan, setPengajuan] = useState<WorkRequest[]>([]);
  const [jadwal, setJadwal] = useState<WorkSchedule | null>(null);
  const [libur, setLibur] = useState<HariLibur[]>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const tahun = new Date().getFullYear();
      const [riwayat, reqs, cfg, kalender] = await Promise.all([
        gateways.attendance.listMine(),
        gateways.request.listMine(user.id),
        gateways.attendance.getActiveConfig(),
        // Kalender hari libur tahun berjalan: hari libur nasional & cuti bersama
        // (SKB tiga menteri) serta libur lokal desa. Tanggal-tanggal inilah yang
        // membuat kalender mengikuti kalender asli, bukan hanya akhir pekan.
        gateways.libur.tahun(tahun),
      ]);
      setItems(riwayat);
      setPengajuan(reqs);
      setJadwal(cfg.schedule);
      setLibur(kalender);
    })();
  }, [user, gateways]);

  const bulanKini = useMemo(() => {
    const prefiks = tanggalISO(new Date()).slice(0, 7);
    // Waktu server disimpan sebagai ISO UTC (…Z), sehingga pemotongan teks
    // mentah salah menempatkan presensi pagi WITA ke hari/bulan sebelumnya
    // (07:30 WITA = 23:30Z hari kemarin). tanggalISO menormalkannya ke WITA.
    return (items ?? []).filter(
      (a) => tanggalISO(a.verification.serverTime).slice(0, 7) === prefiks,
    );
  }, [items]);

  const hadirSet = useMemo(() => {
    const peta = new Map<string, "tepat" | "terlambat" | "tanpa">();
    for (const a of bulanKini) {
      if (a.type !== "CHECK_IN") continue;
      peta.set(
        tanggalISO(a.verification.serverTime),
        a.status === "TERLAMBAT" ? "terlambat" : "tepat",
      );
    }
    // Hari kerja yang tutup buku tanpa presensi dan tanpa izin/sakit/cuti —
    // inilah "tidak melakukan presensi" dalam satu bulan berjalan. Hari libur
    // dikecualikan karena kewajiban presensi memang tidak ada di tanggal itu.
    if (jadwal) {
      const kini = new Date();
      const tertutup = new Set(
        hariKerjaTertutup(
          kini.getFullYear(),
          kini.getMonth() + 1,
          jadwal,
          kalenderLibur(libur),
          kini,
        ),
      );
      const dijelaskan = hariDijelaskan(pengajuan);
      for (const t of tertutup) {
        if (!peta.has(t) && !dijelaskan.has(t)) peta.set(t, "tanpa");
      }
    }
    return peta;
  }, [bulanKini, jadwal, pengajuan, libur]);

  if (!user || !items) {
    return (
      <div className="label-arsip flex h-64 items-center justify-center gap-2 text-tinta/50">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
        Memuat riwayat…
      </div>
    );
  }

  const masukBulan = bulanKini.filter((a) => a.type === "CHECK_IN");
  const keluarBulan = bulanKini.filter((a) => a.type === "CHECK_OUT");
  const terlambat = masukBulan.filter((a) => a.status === "TERLAMBAT").length;
  const pulangCepat = keluarBulan.filter(
    (a) => a.status === "PULANG_CEPAT",
  ).length;
  // Total durasi sebulan — menjawab "lambat berapa menit/jam" dan "cepat
  // berapa menit/jam pulang", dihitung dari waktu server tiap transaksi
  // terhadap ambang jadwal yang berlaku.
  const selisihBulan = ringkasanSelisih(bulanKini, jadwal);
  const totalTerlambat = ringkasSelisih(terlambat, selisihBulan.terlambatMenit);
  const totalPulangCepat = ringkasSelisih(
    pulangCepat,
    selisihBulan.pulangCepatMenit,
  );
  const tanpaBulan = [...hadirSet.values()].filter((v) => v === "tanpa").length;
  const prefiksBulan = tanggalISO(new Date()).slice(0, 7);
  const liburBulan = libur.filter((h) => h.tanggal.slice(0, 7) === prefiksBulan);

  return (
    <>
      <JudulHalaman
        judul="Riwayat presensi"
        kode="Presensi & kehadiran"
        sub={tanggalPanjang(new Date())}
      />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader title="Kalender" sub="Bulan berjalan (WITA)" />
          <div className="p-4">
            <KalenderBulan hadir={hadirSet} libur={petaNamaLibur(libur)} />
            <ul className="mt-4 space-y-1 border-t border-garis pt-3 text-xs text-tinta/60">
              <li>
                Hadir tepat waktu — <strong className="text-tinta">{masukBulan.length - terlambat} hari</strong>
              </li>
              <li>
                Hadir terlambat — <strong className="text-bahaya">{terlambat} hari</strong>
                {totalTerlambat ? (
                  <span className="text-tinta/55"> · {totalTerlambat}</span>
                ) : null}
              </li>
              <li>
                Pulang cepat — <strong className="text-peringatan">{pulangCepat} kali</strong>
                {totalPulangCepat ? (
                  <span className="text-tinta/55"> · {totalPulangCepat}</span>
                ) : null}
              </li>
              <li>
                Tanpa keterangan — <strong className="text-bahaya">{tanpaBulan} hari</strong>
              </li>
              <li>
                Hari libur — <strong className="text-info">{liburBulan.length} hari</strong>{" "}
                <span className="text-tinta/45">(tidak menuntut presensi)</span>
              </li>
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Transaksi" sub="Terbaru lebih dulu" />
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-tinta/50">
              Belum ada transaksi presensi.
            </p>
          ) : (
            <ul className="divide-y divide-garis">
              {items.slice(0, 40).map((a) => {
                // Selisih per baris: "terlambat 25 mnt dari batas masuk 08:00",
                // "pulang cepat 1 jam 10 mnt dari jam pulang 16:00" — dihitung
                // dari waktu server terhadap ambang jadwal yang berlaku.
                const kalimat = kalimatSelisihTransaksi(a, jadwal);
                return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <p className="w-36 text-[13px] font-semibold">
                    {tanggalPanjang(a.verification.serverTime).replace(/^\w+, /, "")}
                  </p>
                  <Badge nada={a.type === "CHECK_IN" ? "primer" : "info"}>
                    {ATTENDANCE_TYPE_LABEL[a.type]}
                  </Badge>
                  <p className="angka-ukur text-[15px] font-semibold">
                    {jam(a.verification.serverTime)}
                  </p>
                  <Badge
                    nada={
                      a.status === "TERLAMBAT"
                        ? "bahaya"
                        : a.status === "PULANG_CEPAT"
                          ? "peringatan"
                          : "netral"
                    }
                  >
                    {ATTENDANCE_STATUS_LABEL[a.status]}
                  </Badge>
                  {kalimat ? (
                    <span className="text-[12px] font-medium text-tinta/55">
                      {kalimat}
                    </span>
                  ) : null}
                  <span className="angka-ukur ml-auto text-[11px] text-tinta/40">
                    {a.mode} · {Math.round(a.verification.geofence.distanceMeters)} m
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
