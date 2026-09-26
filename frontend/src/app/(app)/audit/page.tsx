"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/providers/session";
import { isAdminRole } from "@/core/domain/user";
import type { AuditLog } from "@/core/domain/requests";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jam, tanggalSingkat } from "@/lib/waktu";
import { AksesDitolak } from "@/components/admin/akses-ditolak";

const NADA_AKSI: Record<string, "primer" | "bahaya" | "peringatan" | "info" | "netral"> = {
  MASUK: "netral",
  CHECK_IN: "primer",
  CHECK_OUT: "info",
  MENGAJUKAN: "info",
  MENYETUJUI_PENGAJUAN: "primer",
  MENOLAK_PENGAJUAN: "bahaya",
  MEMBATALKAN_PENGAJUAN: "netral",
  MENGIRIM_PENDAFTARAN_WAJAH: "info",
  MENYETUJUI_BIOMETRIK: "primer",
  MENOLAK_BIOMETRIK: "bahaya",
  // Alur registrasi perangkat desa (dokumen §6)
  MEMBUAT_AKUN: "info",
  MENGAKTIFKAN_AKUN: "primer",
  MENGAKTIFKAN_AKUN_ADMIN: "primer",
  MERESET_KATA_SANDI: "peringatan",
  MENONAKTIFKAN_AKUN: "bahaya",
  MENGUBAH_JADWAL: "peringatan",
  MENGUBAH_KANTOR: "peringatan",
};

export default function HalamanAudit() {
  const { user, gateways } = useSession();
  const [logs, setLogs] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    if (!user || !isAdminRole(user.role)) return;
    void gateways.admin.listAuditLogs().then(setLogs);
  }, [user, gateways]);

  if (!user) return null;
  if (!isAdminRole(user.role)) return <AksesDitolak />;

  return (
    <>
      <JudulHalaman
        judul="Jejak audit"
        kode="Administrasi"
        sub="Siapa melakukan apa, kapan, dan pada data apa — 100 terakhir"
      />

      <Card>
        <CardHeader title="Aktivitas sistem" sub="Tidak dapat diubah dari antarmuka" />
        {logs === null ? (
          <p className="px-4 py-10 text-center text-sm text-tinta/50">Memuat…</p>
        ) : logs.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-tinta/50">
            Belum ada aktivitas tercatat.
          </p>
        ) : (
          <ul className="divide-y divide-garis">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
                <Badge nada={NADA_AKSI[l.action] ?? "netral"}>{l.action}</Badge>
                <p className="text-[13.5px] font-semibold">{l.actorName}</p>
                <p className="flex-1 text-[13px] leading-5 text-tinta/65">{l.detail}</p>
                <p className="angka-ukur ml-auto shrink-0 text-[11px] text-tinta/40">
                  {tanggalSingkat(l.at)} {jam(l.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
