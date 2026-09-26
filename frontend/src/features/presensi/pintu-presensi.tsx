"use client";

import { CalendarCheck, CheckCircle2, Fingerprint, ShieldAlert } from "lucide-react";
import { ATTENDANCE_STATUS_LABEL, type Attendance } from "@/core/domain/attendance";
import { BIOMETRIC_LABEL } from "@/core/domain/user";
import { Badge } from "@/components/ui/badge";
import { TautanTombol } from "@/components/ui/button";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { jam, tanggalPanjang } from "@/lib/waktu";

/** Layar bila biometrik belum aktif — presensi ditutup. */
export function PintuBiometrik({ status }: { status: string }) {
  const menunggu = status === "PENDING_VERIFICATION";
  return (
    <>
      <JudulHalaman
        judul="Presensi"
        kode="Presensi & kehadiran"
        sub={tanggalPanjang(new Date())}
      />
      <section className="folio mx-auto max-w-xl px-6 py-8 text-center sm:px-8">
        <span
          aria-hidden
          className="mx-auto block h-[3px] w-10 rounded-full bg-peringatan"
        />
        <span className="mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-peringatan/10">
          <ShieldAlert className="h-7 w-7 text-peringatan" />
        </span>
        <Badge nada="peringatan" className="mt-4">
          {BIOMETRIC_LABEL[status as keyof typeof BIOMETRIC_LABEL] ?? status}
        </Badge>
        <h2 className="mt-4 font-display text-[21px] font-bold tracking-[-0.015em]">
          {menunggu
            ? "Pendaftaran wajah Anda sedang diverifikasi."
            : "Selesaikan pendaftaran wajah dahulu."}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-tinta/65">
          {menunggu
            ? "Sekretaris desa memeriksa foto wajah Anda. Presensi terbuka setelah disetujui."
            : "Presensi memerlukan verifikasi wajah. Daftarkan lewat kamera — hanya butuh beberapa foto."}
        </p>
        {!menunggu ? (
          <TautanTombol href="/enrollment" className="mt-7 gap-2">
            <Fingerprint className="h-4 w-4" /> Daftarkan Wajah
          </TautanTombol>
        ) : null}
      </section>
    </>
  );
}

/**
 * Layar bila pengajuan yang **menutup kehadiran** berlaku hari ini —
 * izin/sakit/cuti yang disetujui.
 *
 * WFH dan dinas luar tidak pernah sampai ke layar ini: keduanya tetap wajib
 * presensi (dengan mode WFH/DINAS_LUAR) sehingga halaman presensi tetap terbuka
 * dan hanya menampilkan catatan mode. Kalau keduanya ikut menutup pintu, hari
 * itu tidak pernah tercatat hadir dan perangkatnya divonis tanpa keterangan.
 */
export function PintuIzin({ label }: { label: string }) {
  return (
    <>
      <JudulHalaman
        judul="Presensi"
        kode="Presensi & kehadiran"
        sub={tanggalPanjang(new Date())}
      />
      <section className="folio mx-auto max-w-xl px-6 py-8 text-center sm:px-8">
        <span aria-hidden className="mx-auto block h-[3px] w-10 rounded-full bg-info" />
        <span className="mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-info/8">
          <CalendarCheck className="h-7 w-7 text-info" />
        </span>
        <Badge nada="info" className="mt-4">
          {label}
        </Badge>
        <h2 className="mt-4 font-display text-[21px] font-bold tracking-[-0.015em]">
          Tidak perlu presensi kamera hari ini.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-tinta/65">
          Anda tercatat {label.toLowerCase()} berdasarkan pengajuan yang
          disetujui kepala desa.
        </p>
      </section>
    </>
  );
}

/**
 * Layar bila presensi datang dan pulang hari ini sudah lengkap. Bukan sekadar
 * penutup: pasangan jam masuk–pulang dan statusnya ditampilkan kembali, karena
 * inilah catatan yang akan muncul di riwayat dan rekap bulanan.
 */
export function PintuSelesai({
  checkIn,
  checkOut,
}: {
  checkIn: Attendance;
  checkOut: Attendance;
}) {
  return (
    <>
      <JudulHalaman
        judul="Presensi"
        kode="Presensi & kehadiran"
        sub={tanggalPanjang(new Date())}
        aksi={<Badge nada="primer">Presensi hari ini lengkap</Badge>}
      />
      <section className="folio mx-auto max-w-xl px-6 py-8 text-center sm:px-8">
        <span aria-hidden className="mx-auto block h-[3px] w-10 rounded-full bg-primer" />
        <span className="mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primer/10">
          <CheckCircle2 className="h-7 w-7 text-primer" />
        </span>
        <h2 className="mt-4 font-display text-[21px] font-bold tracking-[-0.015em]">
          Datang dan pulang sudah tercatat.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-6 text-tinta/65">
          Tidak ada lagi presensi yang perlu dilakukan hari ini. Perubahan
          catatan hanya dapat dilakukan lewat koreksi admin.
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <BacaanPresensi
            label="Datang"
            waktu={jam(checkIn.verification.serverTime)}
            status={checkIn.status}
          />
          <BacaanPresensi
            label="Pulang"
            waktu={jam(checkOut.verification.serverTime)}
            status={checkOut.status}
          />
        </div>

        <p className="angka-ukur mt-6 text-[11px] text-tinta/45">
          {checkIn.office.name} ·{" "}
          {Math.round(checkIn.verification.geofence.distanceMeters)} m dari kantor
        </p>
      </section>
    </>
  );
}

/** Bacaan jam tercatat pada lembar folio. */
function BacaanPresensi({
  label,
  waktu,
  status,
}: {
  label: string;
  waktu: string;
  status: string;
}) {
  const labelStatus =
    ATTENDANCE_STATUS_LABEL[status as keyof typeof ATTENDANCE_STATUS_LABEL] ?? status;
  return (
    <div className="rounded-slip border border-garis bg-folio-2/60 px-4 py-3">
      <p className="label-arsip text-tinta/45">{label}</p>
      <p className="angka-ukur mt-1.5 text-[26px] font-semibold leading-none text-tinta">
        {waktu}
      </p>
      <p className="mt-1 text-[11.5px] text-tinta/55">{labelStatus}</p>
    </div>
  );
}
