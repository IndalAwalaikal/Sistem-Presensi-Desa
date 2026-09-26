"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/providers/session";
import { isAdminRole } from "@/core/domain/user";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import { relatif } from "@/lib/waktu";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { AksesDitolak } from "@/components/admin/akses-ditolak";

export default function HalamanVerifikasiWajah() {
  const { user, gateways } = useSession();
  const [pending, setPending] = useState<FaceEnrollment[]>([]);
  const [catatan, setCatatan] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!user || !isAdminRole(user.role)) return;
    setPending(await gateways.admin.listPendingEnrollments());
  }, [user, gateways]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  async function putuskan(id: string, setuju: boolean) {
    try {
      await gateways.admin.reviewEnrollment(id, setuju, catatan[id]?.trim() || undefined);
      setInfo(setuju ? "Biometrik disetujui — pengguna bisa presensi." : "Pendaftaran ditolak.");
      await muat();
    } catch (err) {
      setInfo(err instanceof Error ? err.message : "Gagal memutuskan.");
    }
  }

  if (!user) return null;
  if (!isAdminRole(user.role)) return <AksesDitolak />;

  return (
    <>
      <JudulHalaman
        judul="Verifikasi wajah"
        kode="Administrasi"
        sub="Setujui atau tolak pendaftaran biometrik perangkat desa"
      />

      {info ? (
        <p className="mb-4 rounded-slip border border-primer/30 bg-primer/8 px-4 py-2.5 text-[13px] font-medium text-primer">
          {info}
        </p>
      ) : null}

      {pending.length === 0 ? (
        <Card>
          <div className="px-4 py-12 text-center">
            <p className="font-display text-[15px] font-semibold">Tidak ada antrean.</p>
            <p className="mt-1 text-[13px] text-tinta/55">
              Semua pendaftaran wajah sudah diproses.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map((e) => (
            <Card key={e.id}>
              <CardHeader
                title={e.userName}
                sub={`Dikirim ${relatif(e.submittedAt ?? new Date().toISOString())}`}
                aksi={<Badge nada="peringatan">Menunggu</Badge>}
              />
              <div className="p-4">
                {e.photos.length > 0 ? (
                  <div className="flex gap-2">
                    {e.photos.map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={p.dataUrl}
                        alt={`Foto wajah ${i + 1} dari ${e.userName}`}
                        className="h-24 w-24 rounded-slip border border-garis-folio object-cover shadow-slip"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-tinta/50">
                    Pendaftaran ini tidak menyertakan pratinjau foto (data contoh).
                    Verifikasi dilakukan pada sesi presensi pertama.
                  </p>
                )}
                <Input
                  className="mt-3"
                  placeholder="Catatan (opsional)…"
                  value={catatan[e.id] ?? ""}
                  onChange={(ev) => setCatatan((l) => ({ ...l, [e.id]: ev.target.value }))}
                />
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void putuskan(e.id, true)} className="flex-1">
                    Setujui
                  </Button>
                  <Button variasi="bahaya-tombol" onClick={() => void putuskan(e.id, false)} className="flex-1">
                    Tolak
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
