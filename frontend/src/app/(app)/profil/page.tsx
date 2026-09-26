"use client";

import { Fingerprint } from "lucide-react";
import { useSession } from "@/providers/session";
import {
  ACCOUNT_STATUS_LABEL,
  BIOMETRIC_LABEL,
  ROLE_LABEL,
} from "@/core/domain/user";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TautanTombol } from "@/components/ui/button";
import { FormKontak } from "@/features/profil/form-kontak";
import { FormSandi } from "@/features/profil/form-sandi";

const NADA_BIOMETRIK = {
  ACTIVE: "primer",
  PENDING_VERIFICATION: "peringatan",
  NOT_ENROLLED: "netral",
  REJECTED: "bahaya",
  EXPIRED: "bahaya",
} as const;

const PESAN_BIOMETRIK: Record<string, string> = {
  ACTIVE: "Wajah Anda terverifikasi. Presensi kamera aktif di dalam geofence kantor.",
  PENDING_VERIFICATION:
    "Foto wajah Anda sedang diperiksa sekretaris desa. Presensi terbuka setelah disetujui.",
  NOT_ENROLLED:
    "Anda belum mendaftarkan wajah. Daftarkan lewat kamera — hanya butuh beberapa foto.",
  REJECTED:
    "Pendaftaran sebelumnya ditolak. Silakan daftar ulang dengan foto yang lebih baik.",
  EXPIRED: "Data biometrik kedaluwarsa. Daftar ulang untuk mengaktifkan presensi.",
};

export default function HalamanProfil() {
  const { user } = useSession();

  if (!user) return null;

  const baris: Array<[string, string]> = [
    ["Nama lengkap", user.fullName],
    ["Email dinas", user.email],
    ["Status akun", ACCOUNT_STATUS_LABEL[user.accountStatus]],
    ["Persetujuan wajah", user.biometricConsentAt ? "Tercatat" : "Belum dicatat"],
    ["NIP", user.official.employeeId],
    ["Jabatan", user.official.position],
    ["Unit kerja", user.official.unit],
    ["Telepon", user.official.phoneNumber],
    ["Alamat", user.official.address],
  ];

  return (
    <>
      <JudulHalaman
        judul="Profil"
        kode="Kepegawaian"
        sub="Identitas kepegawaian dan status biometrik"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title={user.fullName}
              sub={`${ROLE_LABEL[user.role]} · Pemerintah Desa Anabanua`}
            />
            <dl className="divide-y divide-garis">
              {baris.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-6 px-4 py-2.5">
                  <dt className="text-[13px] text-tinta/55">{k}</dt>
                  <dd className="text-right text-[13.5px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Kontak"
              sub="Nomor telepon & alamat — dapat Anda perbarui sendiri"
            />
            {/* key = nilai dari server: formulir disegarkan setelah tersimpan. */}
            <FormKontak
              key={`${user.official.phoneNumber}|${user.official.address}`}
              user={user}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Biometrik wajah" sub="Syarat presensi terverifikasi" />
            <div className="p-4">
              <Badge nada={NADA_BIOMETRIK[user.biometricStatus]}>
                {BIOMETRIC_LABEL[user.biometricStatus]}
              </Badge>
              <p className="mt-3 text-[13.5px] leading-6 text-tinta/65">
                {PESAN_BIOMETRIK[user.biometricStatus]}
              </p>
              {user.biometricStatus !== "PENDING_VERIFICATION" ? (
                <TautanTombol href="/enrollment" className="mt-5 gap-2">
                  <Fingerprint className="h-4 w-4" />
                  {user.biometricStatus === "ACTIVE" ? "Perbarui data wajah" : "Daftarkan wajah"}
                </TautanTombol>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Kata sandi" sub="Hanya Anda yang mengetahuinya" />
            <FormSandi />
          </Card>

          <Card>
            <CardHeader
              title="Perubahan data kepegawaian"
              sub="Bukan dari aplikasi"
            />
            <p className="px-4 py-4 text-[13.5px] leading-6 text-tinta/65">
              Nama, NIP, jabatan, dan unit kerja bersumber dari berkas
              kepegawaian desa — bila ada yang keliru, ajukan perbaikan kepada
              sekretaris desa. Yang dapat Anda ubah sendiri hanyalah nomor
              telepon serta alamat (kartu Kontak) dan kata sandi Anda (kartu
              Kata sandi). Nilai di layar ini selalu dibaca ulang dari server,
              bukan disimpan di peramban.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
