"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { useSession } from "@/providers/session";
import { bolehKelolaJadwal } from "@/core/domain/user";
import { HARI_LABEL, URUTAN_HARI } from "@/core/domain/attendance";
import type {
  OfficeLocation,
  UpdateOfficeCommand,
  UpdateScheduleCommand,
  WorkSchedule,
  JadwalKhusus,
  CreateJadwalKhususCommand,
  AuditLog,
} from "@/core/ports/gateways";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Badge } from "@/components/ui/badge";
import { AksesDitolak } from "@/components/admin/akses-ditolak";
import { FormJadwal } from "@/features/jadwal/form-jadwal";
import { FormKantor } from "@/features/jadwal/form-kantor";
import { FormJadwalKhusus } from "@/features/jadwal/form-jadwal-khusus";
import { TimelineKonfigurasi } from "@/features/jadwal/timeline-konfigurasi";

export default function HalamanJadwal() {
  const { user, gateways } = useSession();
  const [jadwal, setJadwal] = useState<WorkSchedule | null>(null);
  const [kantor, setKantor] = useState<OfficeLocation | null>(null);
  const [akurasiMaksMeter, setAkurasiMaksMeter] = useState(0);
  const [sedang, setSedang] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangKantor, setSedangKantor] = useState(false);
  const [galatKantor, setGalatKantor] = useState<string | null>(null);
  const [jadwalKhusus, setJadwalKhusus] = useState<JadwalKhusus[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [sedangKhusus, setSedangKhusus] = useState(false);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    if (!user || !bolehKelolaJadwal(user.role)) return;
    let aktif = true;
    // Jadwal aktif adalah data utama. Kegagalan jadwal khusus atau audit
    // jangan membuat seluruh halaman terjebak pada indikator memuat.
    void (async () => {
      try {
        const cfg = await gateways.attendance.getActiveConfig();
        if (!aktif) return;
        setJadwal(cfg.schedule);
        setKantor(cfg.office);
        setAkurasiMaksMeter(cfg.maxAccuracyMeters);

        const [jk, logs] = await Promise.allSettled([
          gateways.admin.listJadwalKhusus(),
          gateways.admin.listAuditLogs(),
        ]);
        if (!aktif) return;
        if (jk.status === "fulfilled") setJadwalKhusus(jk.value ?? []);
        if (logs.status === "fulfilled") setAuditLogs(logs.value);
        if (jk.status === "rejected" || logs.status === "rejected") {
          setGalatMuat("Sebagian data pendukung gagal dimuat. Pengaturan jam kerja utama tetap dapat digunakan.");
        }
      } catch (err) {
        if (!aktif) return;
        setGalatMuat(err instanceof Error ? err.message : "Konfigurasi jam kerja gagal dimuat.");
      }
    })();
    return () => { aktif = false; };
  }, [user, gateways, muatUlang]);

  if (!user) return null;
  if (!bolehKelolaJadwal(user.role)) return <AksesDitolak />;

  async function simpan(command: UpdateScheduleCommand): Promise<boolean> {
    setSedang(true);
    setGalat(null);
    try {
      const baru = await gateways.admin.updateSchedule(command);
      setJadwal(baru);
      try {
        setAuditLogs(await gateways.admin.listAuditLogs());
      } catch {
        setGalatMuat("Jam kerja berhasil disimpan, tetapi log audit gagal diperbarui.");
      }
      return true;
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Jam kerja gagal disimpan.");
      return false;
    } finally {
      setSedang(false);
    }
  }

  async function simpanKantor(command: UpdateOfficeCommand): Promise<boolean> {
    setSedangKantor(true);
    setGalatKantor(null);
    try {
      const baru = await gateways.admin.updateOffice(command);
      setKantor(baru);
      try {
        setAuditLogs(await gateways.admin.listAuditLogs());
      } catch {
        setGalatMuat("Lokasi kantor berhasil disimpan, tetapi log audit gagal diperbarui.");
      }
      return true;
    } catch (err) {
      setGalatKantor(err instanceof Error ? err.message : "Lokasi kantor gagal disimpan.");
      return false;
    } finally {
      setSedangKantor(false);
    }
  }

  async function handleTambahJadwalKhusus(cmd: CreateJadwalKhususCommand): Promise<boolean> {
    setSedangKhusus(true);
    try {
      await gateways.admin.createJadwalKhusus(cmd);
      const [jkBaru, logsBaru] = await Promise.allSettled([
        gateways.admin.listJadwalKhusus(),
        gateways.admin.listAuditLogs(),
      ]);
      if (jkBaru.status === "fulfilled") setJadwalKhusus(jkBaru.value);
      if (logsBaru.status === "fulfilled") setAuditLogs(logsBaru.value);
      if (jkBaru.status === "rejected" || logsBaru.status === "rejected") {
        setGalatMuat("Jadwal khusus berhasil disimpan, tetapi sebagian data pendukung gagal diperbarui.");
      }
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan jadwal khusus.");
      return false;
    } finally {
      setSedangKhusus(false);
    }
  }

  async function handleHapusJadwalKhusus(id: string): Promise<void> {
    setSedangKhusus(true);
    try {
      await gateways.admin.deleteJadwalKhusus(id);
      const [jkBaru, logsBaru] = await Promise.allSettled([
        gateways.admin.listJadwalKhusus(),
        gateways.admin.listAuditLogs(),
      ]);
      if (jkBaru.status === "fulfilled") setJadwalKhusus(jkBaru.value);
      if (logsBaru.status === "fulfilled") setAuditLogs(logsBaru.value);
      if (jkBaru.status === "rejected" || logsBaru.status === "rejected") {
        setGalatMuat("Jadwal khusus berhasil dihapus, tetapi sebagian data pendukung gagal diperbarui.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus jadwal khusus.");
    } finally {
      setSedangKhusus(false);
    }
  }

  return (
    <>
      <JudulHalaman
        judul="Jam kerja & lokasi kantor"
        kode="Administrasi"
        sub="Patokan waktu dan titik geofence presensi seluruh perangkat desa"
      />

      {galatMuat ? (
        <div
          role="alert"
          className="mb-4 rounded-slip border border-bahaya/30 bg-bahaya/8 px-4 py-3 text-[13px] text-bahaya"
        >
          <p>{galatMuat}</p>
          {jadwal === null || kantor === null ? (
            <button
              type="button"
              className="mt-2 font-semibold underline"
              onClick={() => {
                setGalatMuat(null);
                setMuatUlang((n) => n + 1);
              }}
            >
              Coba muat ulang
            </button>
          ) : null}
        </div>
      ) : null}

      {jadwal === null || kantor === null ? (
        <p className="label-arsip flex h-40 items-center justify-center gap-2 text-tinta/50">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
          Memuat jam kerja & lokasi kantor…
        </p>
      ) : (
        <div className="space-y-5">
          <FormJadwal
            key={[
              jadwal.checkInStart,
              jadwal.checkInDeadline,
              jadwal.checkOutStart,
              jadwal.checkOutEnd,
              jadwal.workDays.join(","),
            ].join("|")}
            jadwal={jadwal}
            sedang={sedang}
            galat={galat}
            onSimpan={simpan}
          />

          <FormKantor
            key={`${kantor.name}|${kantor.point.latitude}|${kantor.point.longitude}|${kantor.radiusMeters}`}
            kantor={kantor}
            akurasiMaksMeter={akurasiMaksMeter}
            sedang={sedangKantor}
            galat={galatKantor}
            onSimpan={simpanKantor}
          />

          <section className="folio px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Clock className="h-4 w-4 text-tinta/40" />
              <h2 className="font-display text-[15.5px] font-bold tracking-[-0.01em]">
                Jam kerja yang berlaku sekarang
              </h2>
              <Badge nada="primer" className="ml-auto">
                {jadwal.name}
              </Badge>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-slip border border-garis bg-folio-2/60 px-4 py-3">
                <dt className="label-arsip text-tinta/45">Presensi datang</dt>
                <dd className="angka-ukur mt-1 text-[20px] font-semibold leading-none">
                  {jadwal.checkInStart} – {jadwal.checkInDeadline}
                </dd>
                <p className="mt-1.5 text-[12px] leading-snug text-tinta/55">
                  Presensi datang pada jam ini atau sebelumnya tercatat tepat
                  waktu; setelah {jadwal.checkInDeadline} tercatat terlambat.
                </p>
              </div>
              <div className="rounded-slip border border-garis bg-folio-2/60 px-4 py-3">
                <dt className="label-arsip text-tinta/45">Presensi pulang</dt>
                <dd className="angka-ukur mt-1 text-[20px] font-semibold leading-none">
                  {jadwal.checkOutStart} – {jadwal.checkOutEnd}
                </dd>
                <p className="mt-1.5 text-[12px] leading-snug text-tinta/55">
                  Presensi pulang sebelum {jadwal.checkOutStart} tercatat pulang
                  cepat; setelah {jadwal.checkOutEnd} tercatat lebih dari jam kerja.
                </p>
              </div>
            </dl>

            <p className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="label-arsip mr-1 text-tinta/45">Hari kerja</span>
              {URUTAN_HARI.map((hari) => (
                <Badge
                  key={hari}
                  nada={jadwal.workDays.includes(hari) ? "primer" : "netral"}
                >
                  {HARI_LABEL[hari]}
                </Badge>
              ))}
            </p>
          </section>

          <section className="folio px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <MapPin className="h-4 w-4 text-tinta/40" />
              <h2 className="font-display text-[15.5px] font-bold tracking-[-0.01em]">
                Lokasi kantor yang berlaku sekarang
              </h2>
              <Badge nada="primer" className="ml-auto">
                Radius {kantor.radiusMeters} m
              </Badge>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-slip border border-garis bg-folio-2/60 px-4 py-3">
                <dt className="label-arsip text-tinta/45">Nama kantor</dt>
                <dd className="mt-1 text-[17px] font-semibold leading-snug">
                  {kantor.name}
                </dd>
              </div>
              <div className="rounded-slip border border-garis bg-folio-2/60 px-4 py-3">
                <dt className="label-arsip text-tinta/45">Titik geofence</dt>
                <dd className="angka-ukur mt-1 text-[17px] font-semibold leading-snug">
                  {kantor.point.latitude.toFixed(7)}, {kantor.point.longitude.toFixed(7)}
                </dd>
              </div>
              <div className="rounded-slip border border-garis bg-folio-2/60 px-4 py-3">
                <dt className="label-arsip text-tinta/45">Akurasi GPS maksimum</dt>
                <dd className="angka-ukur mt-1 text-[17px] font-semibold leading-snug">
                  ±{akurasiMaksMeter} m
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-[12px] leading-snug text-tinta/55">
              Presensi hanya diterima bila perangkat berada di dalam radius ini dan
              akurasi GPS-nya tidak melebihi batas akurasi di atas. Titik diambil dari
              perangkat yang berdiri di tempat kerja, bukan dari peta, sehingga tidak
              meleset puluhan meter.
            </p>
          </section>

          {/* Bagian Jadwal Khusus (Ramadan, Shift, dsb.) */}
          <FormJadwalKhusus
            daftar={jadwalKhusus}
            sedang={sedangKhusus}
            onTambah={handleTambahJadwalKhusus}
            onHapus={handleHapusJadwalKhusus}
          />

          {/* Timeline Riwayat & Jejak Audit Konfigurasi */}
          <TimelineKonfigurasi logs={auditLogs} />
        </div>
      )}
    </>
  );
}
