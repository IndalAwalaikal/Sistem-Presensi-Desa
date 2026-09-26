"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/providers/session";
import type {
  AttendanceMode,
  AttendanceType,
  OfficeLocation,
  PresensiResult,
  TodayStatus,
  WorkSchedule,
} from "@/core/ports/gateways";
import { ATTENDANCE_MODE_LABEL } from "@/core/domain/attendance";
import { ambilLokasi, type Lokasi } from "@/lib/gps";
import { potretFrame, skorLiveness, skorWajahDemo } from "@/lib/liveness";
import { useKamera } from "@/lib/use-kamera";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Badge } from "@/components/ui/badge";
import { PanelKamera, type Tahap } from "@/features/presensi/panel-kamera";
import { HasilPresensi } from "@/features/presensi/hasil-presensi";
import { AnimasiHasil } from "@/features/presensi/animasi-hasil";
import {
  ringkasanHasilPresensi,
  type RingkasanHasilPresensi,
} from "@/core/usecase/hasil-presensi";
import {
  PintuBiometrik,
  PintuIzin,
  PintuSelesai,
} from "@/features/presensi/pintu-presensi";
import { PanelMulai, CatatanMode } from "@/features/presensi/panel-mulai";
import { jam, tanggalPanjang } from "@/lib/waktu";
import { tambahAntreanPresensi } from "@/lib/offline-queue";
import { AntreanOfflineWidget } from "@/features/presensi/antrean-offline-widget";

interface Langkah {
  label: string;
  selesai: boolean;
  gagal?: boolean;
}

const LANGKAH_AWAL: Langkah[] = [
  { label: "Wajah terdeteksi dan terbaca", selesai: false },
  { label: "Pemeriksaan keaslian wajah", selesai: false },
  { label: "Kecocokan dengan wajah terdaftar", selesai: false },
  { label: "Lokasi & geofence kantor", selesai: false },
  { label: "Waktu server & jadwal", selesai: false },
];

function tunggu(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function HalamanPresensi() {
  const { user, gateways, segarkan } = useSession();
  const kamera = useKamera();
  /** `true` = data dinamis dari backend via HTTP; `false` = contoh lokal. */
  const modeHttp = process.env.NEXT_PUBLIC_API_MODE !== "mock";
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [kantor, setKantor] = useState<OfficeLocation | null>(null);
  const [jadwal, setJadwal] = useState<WorkSchedule | null>(null);
  const [lokasi, setLokasi] = useState<Lokasi | null>(null);
  const [tahap, setTahap] = useState<Tahap>("siap");
  /** Jenis presensi yang dipilih pengguna di panel (datang atau pulang). */
  const [jenis, setJenis] = useState<AttendanceType>("CHECK_IN");
  const [hasil, setHasil] = useState<PresensiResult | null>(null);
  /**
   * Ringkasan yang sedang dianimasikan sebagai cap besar; `null` berarti
   * animasinya sudah selesai dan rincian penuh yang ditampilkan.
   */
  const [animasi, setAnimasi] = useState<RingkasanHasilPresensi | null>(null);
  const [langkah, setLangkah] = useState<Langkah[]>(LANGKAH_AWAL);
  /** Galat lokasi GPS: di mode backend membuat presensi tidak dapat lanjut. */
  const [galatLokasi, setGalatLokasi] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [s, cfg] = await Promise.all([
        gateways.attendance.getTodayStatus(user.id),
        gateways.attendance.getActiveConfig(),
      ]);
      setStatus(s);
      setKantor(cfg.office);
      setJadwal(cfg.schedule);
    })();
  }, [user, gateways]);

  /**
   * Mode presensi yang sah hari ini: pengajuan WFH/dinas luar yang disetujui
   * menyarankan modenya (dan membebaskan radius kantor), selebihnya WFO. Server
   * memeriksa ulang mode ini terhadap pengajuan — layar tidak dapat "memilih"
   * WFH tanpa dasar.
   */
  const modePresensi = useMemo<AttendanceMode>(
    () => (status?.kind === "BELUM_PRESENSI" ? status.modeSaran ?? "WFO" : "WFO"),
    [status],
  );

  const tandai = useCallback(
    (i: number, selesai: boolean, gagal = false, label?: string) => {
      setLangkah((lama) =>
        lama.map((l, idx) =>
          idx === i ? { ...l, selesai, gagal, label: label ?? l.label } : l,
        ),
      );
    },
    [],
  );

  const jalankan = useCallback(
    async (pilihan: AttendanceType) => {
      if (!user || !kantor) return;
      setJenis(pilihan);
      setHasil(null);
      setGalatLokasi(null);
      setLangkah(LANGKAH_AWAL);
      setTahap("kamera");

      await kamera.mulai();
      const lokasiHasil = await ambilLokasi().then(
        (l) => ({ ok: true as const, l }),
        (err: Error) => ({ ok: false as const, pesan: err.message }),
      );

      const video = kamera.videoRef.current;
      for (let i = 0; i < 30 && !video?.videoWidth; i++) {
        await tunggu(100);
      }

      // Langkah 1–3: wajah, liveness, kecocokan.
      await tunggu(500);
      const frameA = video?.videoWidth ? potretFrame(video) : null;
      await tunggu(400);
      const frameB = video?.videoWidth ? potretFrame(video) : null;
      const skorHidup = frameA && frameB ? skorLiveness(frameA, frameB) : 0;
      const foto = kamera.tangkap();
      const skorWajah = foto ? skorWajahDemo(foto) : 0;
      tandai(0, false, !foto, foto ? "Bingkai dikirim untuk pemeriksaan wajah" : "Wajah belum dapat diambil");
      if (modeHttp) {
        tandai(1, false, false, "Menunggu pemeriksaan layanan server");
        tandai(2, false, false, "Menunggu pemeriksaan layanan server");
      } else {
        tandai(1, skorHidup > 0.15, skorHidup <= 0.15);
        tandai(2, skorWajah >= 0.62, skorWajah < 0.62);
      }

      // Langkah 4: lokasi perangkat. GPS gagal/kurang akurat → alur dihentikan
      // dengan pesan yang jelas. Tidak ada posisi buatan yang dikirim ke
      // server: koordinat presensi harus benar-benar dari perangkat pengguna.
      if (!lokasiHasil.ok) {
        kamera.hentikan();
        tandai(3, false, true, "Lokasi & geofence kantor (GPS gagal)");
        setGalatLokasi(lokasiHasil.pesan);
        setTahap("siap");
        return;
      }
      const titik: Lokasi = lokasiHasil.l;
      setLokasi(titik);
      tandai(3, false, false, "Lokasi didapat, menunggu pemeriksaan server");

      // Langkah 5: keputusan di sisi server dengan waktu server.
      tandai(4, false, false, "Menunggu waktu server dan evaluasi jadwal");
      await tunggu(300);

      let hasilPresensi: PresensiResult;
      const isOffline = modeHttp && typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        await tambahAntreanPresensi({
          userId: user.id,
          userName: user.fullName,
          type: pilihan,
          mode: modePresensi,
          faceScore: skorWajah,
          livenessScore: Math.max(skorHidup, 0.2),
          location: { latitude: titik.latitude, longitude: titik.longitude },
          accuracyMeters: titik.accuracyMeters,
          frameDataUrl: foto ?? undefined,
          waktuPencatatan: new Date().toISOString(),
        });

        hasilPresensi = {
          accepted: false,
          rejection: {
            code: "PENDING_SYNC",
            message: "Belum tercatat. Data tersimpan sementara dan menunggu verifikasi server saat jaringan pulih.",
          },
        };
      } else {
        try {
          hasilPresensi = await gateways.attendance.submitPresensi({
            type: pilihan,
            mode: modePresensi,
            faceScore: skorWajah,
            livenessScore: Math.max(skorHidup, 0.2),
            location: { latitude: titik.latitude, longitude: titik.longitude },
            accuracyMeters: titik.accuracyMeters,
            frameDataUrl: foto ?? undefined,
          });
        } catch (err) {
          // Hanya kegagalan jaringan (fetch TypeError) boleh masuk antrean.
          // Error HTTP seperti 401/422/500 bukan presensi offline dan tidak
          // boleh disamarkan sebagai presensi lokal yang berhasil.
          if (modeHttp && err instanceof TypeError) {
            await tambahAntreanPresensi({
              userId: user.id,
              userName: user.fullName,
              type: pilihan,
              mode: modePresensi,
              faceScore: skorWajah,
              livenessScore: Math.max(skorHidup, 0.2),
              location: { latitude: titik.latitude, longitude: titik.longitude },
              accuracyMeters: titik.accuracyMeters,
              frameDataUrl: foto ?? undefined,
              waktuPencatatan: new Date().toISOString(),
            });
            hasilPresensi = {
              accepted: false,
              rejection: {
                code: "PENDING_SYNC",
                message: "Belum tercatat. Data tersimpan sementara dan menunggu verifikasi server saat jaringan pulih.",
              },
            };
          } else {
            hasilPresensi = {
              accepted: false,
              rejection: {
                code: "SERVER_ERROR",
                message: err instanceof Error ? err.message : "Server gagal memeriksa presensi.",
              },
            };
          }
        }
      }

      const verifikasiServer = hasilPresensi.verification;
      const kodeTolak = hasilPresensi.rejection?.code;
      const lolosSemua = Boolean(
        hasilPresensi.accepted &&
        hasilPresensi.attendance &&
        verifikasiServer?.faceMatch &&
        verifikasiServer.liveness &&
        verifikasiServer.geofence.verdict === "INSIDE",
      );
      if (lolosSemua && verifikasiServer) {
        tandai(0, true, false, "Wajah berhasil dideteksi");
        tandai(1, true);
        tandai(2, true);
        tandai(3, true);
        tandai(4, true);
        // Beri waktu agar kelima kriteria hijau terbaca sebelum ceklis muncul.
        await tunggu(700);
      } else if (verifikasiServer) {
        tandai(0, true, false, "Wajah berhasil dideteksi");
        tandai(1, verifikasiServer.liveness, !verifikasiServer.liveness);
        tandai(2, verifikasiServer.faceMatch, !verifikasiServer.faceMatch);
        tandai(3, false, true, "Lokasi belum lolos pemeriksaan server");
        tandai(4, false, true, "Presensi belum disahkan server");
      } else if (kodeTolak === "FACE_FAILED") {
        tandai(0, false, true, "Wajah tidak terbaca atau tidak cocok");
        tandai(2, false, true);
        tandai(3, false, false, "Menunggu pemeriksaan server");
        tandai(4, false, true, "Presensi belum disahkan server");
      } else if (kodeTolak === "LIVENESS_FAILED") {
        tandai(1, false, true);
        tandai(4, false, true, "Presensi belum disahkan server");
      } else if (kodeTolak === "GPS_INACCURATE" || kodeTolak === "OUTSIDE_GEOFENCE" || kodeTolak === "MODE_TIDAK_DISETUJUI") {
        tandai(3, false, true);
        tandai(4, false, true, "Presensi belum disahkan server");
      } else if (kodeTolak !== "PENDING_SYNC") {
        tandai(4, false, true, "Presensi belum disahkan server");
      }

      const hasilTampilan: PresensiResult = hasilPresensi.accepted && !lolosSemua
        ? {
            accepted: false,
            rejection: {
              code: "SERVER_ERROR",
              message: "Server tidak memberikan hasil verifikasi lengkap. Periksa riwayat sebelum mencoba kembali.",
            },
          }
        : hasilPresensi;

      setAnimasi(
        kodeTolak === "PENDING_SYNC" || (hasilPresensi.accepted && !lolosSemua)
          ? null
          : ringkasanHasilPresensi(
          hasilTampilan,
          {
            nama: user.fullName,
            office: { name: kantor.name, radiusMeters: kantor.radiusMeters },
            lokasi: titik,
            jadwal,
          },
          pilihan,
            ),
      );
      setHasil(hasilTampilan);
      setTahap("hasil");
      kamera.hentikan();
      if (hasilPresensi.accepted) {
        try {
          await segarkan();
          setStatus(await gateways.attendance.getTodayStatus(user.id));
        } catch {
          // Transaksi sudah diterima server; kegagalan refresh tidak boleh
          // mengubah hasil presensi yang telah dikonfirmasi.
        }
      }
    },
    [user, kantor, gateways, kamera, tandai, segarkan, jadwal, modePresensi, modeHttp],
  );

  const ulangi = useCallback(() => {
    setHasil(null);
    setAnimasi(null);
    setTahap("siap");
  }, []);

  if (!user || !status || !kantor || !jadwal) {
    return (
      <div className="label-arsip flex h-64 items-center justify-center gap-2 text-tinta/50">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
        Memeriksa akun dan status biometrik…
      </div>
    );
  }

  if (user.biometricStatus !== "ACTIVE") {
    return <PintuBiometrik status={user.biometricStatus} />;
  }

  if (status.kind === "IZIN") {
    return <PintuIzin label={status.label} />;
  }

  // Presensi datang dan pulang sudah lengkap: tidak ada lagi yang dapat
  // dikerjakan hari ini, jadi halaman berhenti di rekap harian.
  if (status.kind === "SELESAI") {
    return <PintuSelesai checkIn={status.checkIn} checkOut={status.checkOut} />;
  }

  return (
    <>
      <JudulHalaman
        judul="Presensi"
        kode="Presensi & kehadiran"
        sub={`${tanggalPanjang(new Date())} · ${kantor.name} · radius ${kantor.radiusMeters} m`}
        aksi={
          status.kind === "BELUM_PRESENSI" && status.modeSaran ? (
            <Badge nada="info">
              Disetujui {ATTENDANCE_MODE_LABEL[status.modeSaran]} — presensi tetap wajib
            </Badge>
          ) : status.kind === "SUDAH_CHECKIN" ? (
            <Badge nada="peringatan">Sudah presensi datang — tinggal pulang</Badge>
          ) : (
            <Badge nada="primer">Siap presensi</Badge>
          )
        }
      />

      <div className="mb-4">
        <AntreanOfflineWidget
          onSyncSukses={async () => {
            await segarkan();
            if (user) {
              setStatus(await gateways.attendance.getTodayStatus(user.id));
            }
          }}
        />
      </div>

      {tahap === "hasil" && hasil ? (
        <>
          {animasi ? (
            <AnimasiHasil ringkasan={animasi} onSelesai={() => setAnimasi(null)} />
          ) : null}
          <HasilPresensi
            hasil={hasil}
            info={{
              nama: user.fullName,
              office: {
                name: kantor.name,
                radiusMeters: kantor.radiusMeters,
                point: kantor.point,
              },
              lokasi,
              jadwal,
            }}
            onUlangi={ulangi}
          />
        </>
      ) : tahap === "kamera" ? (
        <>
          <PanelKamera
            videoRef={kamera.videoRef}
            status={kamera.status}
            pesan={kamera.pesan}
            onUlangi={() => void jalankan(jenis)}
            langkah={langkah}
            berjalan
          />
          {galatLokasi ? (
            <p className="label-arsip mt-4 text-center text-bahaya">
              {galatLokasi}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <PanelMulai
            namaKantor={kantor.name}
            radius={kantor.radiusMeters}
            jadwal={jadwal}
            sudahMasuk={status.kind === "SUDAH_CHECKIN"}
            jamMasukHariIni={
              status.kind === "SUDAH_CHECKIN"
                ? jam(status.attendance.verification.serverTime)
                : null
            }
            modeSaran={status.kind === "BELUM_PRESENSI" ? status.modeSaran ?? null : null}
            onMulai={(pilihan) => void jalankan(pilihan)}
          />
          <CatatanMode modeHttp={modeHttp} />
        </>
      )}
    </>
  );
}
