"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/providers/session";
import { isAdminRole, type User } from "@/core/domain/user";
import {
  REQUEST_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  type RequestStatus,
  type WorkRequest,
} from "@/core/domain/requests";
import type { CreateMassalCommand } from "@/core/ports/gateways";
import { relatif } from "@/lib/waktu";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { AksesDitolak } from "@/components/admin/akses-ditolak";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { cn } from "@/lib/cn";
import { FormPengajuanMassal } from "@/features/pengajuan/form-pengajuan-massal";

const TAB: Array<{ nilai: RequestStatus | "SEMUA"; label: string }> = [
  { nilai: "MENUNGGU", label: "Menunggu" },
  { nilai: "DISETUJUI", label: "Disetujui" },
  { nilai: "DITOLAK", label: "Ditolak" },
  { nilai: "SEMUA", label: "Semua" },
];

/**
 * Persetujuan pengajuan — halaman sekretaris/kepala desa. Daftar pengajuan
 * semua perangkat sesuai tab status, masing-masing dapat disetujui/ditolak
 * dengan catatan keputusan. Setiap keputusan tercatat pada log audit.
 */
export default function HalamanPersetujuan() {
  const { user, gateways } = useSession();
  const [tab, setTab] = useState<RequestStatus | "SEMUA">("MENUNGGU");
  const [items, setItems] = useState<WorkRequest[]>([]);
  const [catatan, setCatatan] = useState<Record<string, string>>({});
  const [galat, setGalat] = useState<string | null>(null);

  // ---- Pengajuan massal (mis. cuti bersama) ----
  const [pengguna, setPengguna] = useState<User[]>([]);
  const [kirimMassal, setKirimMassal] = useState(false);
  const [galatMassal, setGalatMassal] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!user || !isAdminRole(user.role)) return;
    const [daftar, orang] = await Promise.all([
      gateways.admin.listAllRequests(tab === "SEMUA" ? undefined : tab),
      gateways.admin.listAllUsers().catch(() => [] as User[]),
    ]);
    setItems(daftar);
    setPengguna(orang.filter((p) => p.accountStatus === "AKTIF"));
  }, [user, gateways, tab]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  async function putuskan(id: string, setuju: boolean) {
    setGalat(null);
    try {
      await gateways.admin.decideRequest({
        requestId: id,
        approve: setuju,
        note: catatan[id]?.trim() || undefined,
      });
      await muat();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Keputusan gagal.");
    }
  }

  if (!user) return null;
  if (!isAdminRole(user.role)) return <AksesDitolak />;

  async function ajukanMassal(command: CreateMassalCommand): Promise<number | null> {
    setGalatMassal(null);
    setKirimMassal(true);
    try {
      const hasil = await gateways.admin.kirimMassal(command);
      await muat();
      return hasil.jumlah;
    } catch (err) {
      setGalatMassal(err instanceof Error ? err.message : "Pengajuan massal gagal.");
      return null;
    } finally {
      setKirimMassal(false);
    }
  }

  return (
    <>
      <JudulHalaman
        judul="Persetujuan pengajuan"
        kode="Administrasi"
        sub="WFH, izin, sakit, cuti, dinas luar, dan koreksi presensi — termasuk pengajuan massal seperti cuti bersama"
      />
      <div className="mb-5">
        <FormPengajuanMassal
          pengguna={pengguna}
          sedang={kirimMassal}
          galat={galatMassal}
          onKirim={ajukanMassal}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TAB.map((t) => (
          <button
            key={t.nilai}
            type="button"
            onClick={() => setTab(t.nilai)}
            className={cn(
              "h-9 rounded-t-slip rounded-b-tanda px-3.5 text-[13px] font-semibold transition-colors",
              tab === t.nilai
                ? "garis-foil text-sampul shadow-slip"
                : "border border-garis bg-folio text-tinta/65 hover:bg-folio-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {galat ? (
        <p className="mb-4 rounded-slip border border-bahaya/30 bg-bahaya/8 px-4 py-2.5 text-[13px] text-bahaya">
          {galat}
        </p>
      ) : null}

      <Card>
        <CardHeader title={`${items.length} pengajuan`} sub="Terbaru lebih dulu" />
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-tinta/50">
            Tidak ada pengajuan pada tab ini.
          </p>
        ) : (
          <ul className="divide-y divide-garis">
            {items.map((r) => (
              <li key={r.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold">{r.userName}</p>
                  <Badge
                    nada={
                      r.status === "DISETUJUI"
                        ? "primer"
                        : r.status === "DITOLAK"
                          ? "bahaya"
                          : r.status === "MENUNGGU"
                            ? "peringatan"
                            : "netral"
                    }
                  >
                    {REQUEST_STATUS_LABEL[r.status]}
                  </Badge>
                  <p className="text-[12px] text-tinta/50">
                    {REQUEST_TYPE_LABEL[r.type]} · {r.startDate} → {r.endDate} ·{" "}
                    {relatif(r.createdAt)}
                    {r.batchId ? " · massal" : ""}
                  </p>
                </div>
                <p className="mt-1 text-[13px] leading-5 text-tinta/65">{r.reason}</p>
                {r.decidedByName ? (
                  <p className="mt-1 text-[12.5px] text-tinta/50">
                    Diputuskan {r.decidedByName}
                    {r.decisionNote ? ` — ${r.decisionNote}` : ""}
                  </p>
                ) : null}
                {r.status === "MENUNGGU" ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Input
                      className="h-9 max-w-xs text-[13px]"
                      placeholder="Catatan keputusan (opsional)…"
                      value={catatan[r.id] ?? ""}
                      onChange={(e) => setCatatan((l) => ({ ...l, [r.id]: e.target.value }))}
                    />
                    <Button variasi="utama" className="h-9 px-3.5" onClick={() => void putuskan(r.id, true)}>
                      Setujui
                    </Button>
                    <Button variasi="bahaya-tombol" className="h-9 px-3.5" onClick={() => void putuskan(r.id, false)}>
                      Tolak
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
