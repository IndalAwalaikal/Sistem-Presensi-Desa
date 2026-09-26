"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useSession } from "@/providers/session";
import { REQUEST_TYPE_LABEL, REQUEST_STATUS_LABEL } from "@/core/domain/requests";
import type { RequestType, WorkRequest } from "@/core/domain/requests";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { tanggalISO } from "@/lib/waktu";

const JENIS: RequestType[] = ["WFH", "IZIN", "SAKIT", "CUTI", "DINAS_LUAR", "KOREKSI_PRESENSI"];

const NADA_STATUS = {
  MENUNGGU: "peringatan",
  DISETUJUI: "primer",
  DITOLAK: "bahaya",
  DIBATALKAN: "netral",
} as const;

export default function HalamanPengajuan() {
  const { user, gateways } = useSession();
  const [items, setItems] = useState<WorkRequest[]>([]);
  const [jenis, setJenis] = useState<RequestType>("IZIN");
  const [mulai, setMulai] = useState(tanggalISO(new Date()));
  const [selesai, setSelesai] = useState(tanggalISO(new Date()));
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const koreksi = jenis === "KOREKSI_PRESENSI";

  const muat = useCallback(async () => {
    if (!user) return;
    setItems(await gateways.request.listMine(user.id));
  }, [user, gateways]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  async function ajukan(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setGalat(null);
    setKirim(true);
    try {
      await gateways.request.create(user.id, user.fullName, {
        type: jenis,
        startDate: mulai,
        endDate: koreksi ? mulai : selesai,
        reason: alasan.trim(),
      });
      setAlasan("");
      await muat();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pengajuan gagal.");
    } finally {
      setKirim(false);
    }
  }

  async function batal(id: string) {
    try {
      await gateways.request.cancel(id);
      await muat();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pembatalan gagal.");
    }
  }

  if (!user) return null;

  return (
    <>
      <JudulHalaman
        judul="Pengajuan"
        kode="Izin & koreksi"
        sub="WFH, izin, sakit, cuti, dinas luar, dan koreksi presensi"
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="Buat pengajuan baru" sub="Diputuskan oleh kepala desa" />
          <form onSubmit={ajukan} className="space-y-4 p-4">
            <Field label="Jenis pengajuan">
              <Select
                value={jenis}
                onChange={(e) => {
                  const berikut = e.target.value as RequestType;
                  setJenis(berikut);
                  if (berikut === "KOREKSI_PRESENSI") setSelesai(mulai);
                }}
              >
                {JENIS.map((j) => (
                  <option key={j} value={j}>
                    {REQUEST_TYPE_LABEL[j]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className={koreksi ? "grid gap-3" : "grid grid-cols-2 gap-3"}>
              <Field label={koreksi ? "Tanggal presensi yang perlu ditinjau" : "Mulai"}>
                <Input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} required />
              </Field>
              {!koreksi ? (
                <Field label="Selesai">
                  <Input type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} required />
                </Field>
              ) : null}
            </div>
            <Field
              label={koreksi ? "Rincian koreksi" : "Alasan / uraian"}
              hint={koreksi
                ? "Jelaskan catatan yang keliru dan informasi yang seharusnya. Permohonan ini akan ditinjau pengelola; catatan presensi asli tidak dihapus."
                : "Jelaskan singkat dan jelas."}
            >
              <Textarea
                rows={4}
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Contoh: mengurus dokumen di kecamatan…"
                required
                minLength={10}
              />
            </Field>
            {galat ? (
              <p role="alert" className="rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] text-bahaya">
                {galat}
              </p>
            ) : null}
            <Button type="submit" className="w-full gap-2" disabled={kirim}>
              <Send className="h-4 w-4" />
              {kirim ? "Mengirim…" : "Kirim pengajuan"}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Pengajuan saya" sub={`${items.length} pengajuan tercatat`} />
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-tinta/50">
              Belum ada pengajuan. Buat lewat formulir di samping.
            </p>
          ) : (
            <ul className="divide-y divide-garis">
              {items.map((r) => (
                <li key={r.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge nada={NADA_STATUS[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                    <p className="text-[14px] font-semibold">{REQUEST_TYPE_LABEL[r.type]}</p>
                    <p className="text-[12px] text-tinta/50">
                      {r.startDate} → {r.endDate}
                    </p>
                    {r.status === "MENUNGGU" ? (
                      <button
                        type="button"
                        onClick={() => void batal(r.id)}
                        className="ml-auto text-[12.5px] font-semibold text-bahaya hover:underline"
                      >
                        Batalkan
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-tinta/65">{r.reason}</p>
                  {r.decisionNote ? (
                    <p className="mt-1 text-[12.5px] text-tinta/50">
                      Catatan {r.decidedByName ?? "penyetuju"}: {r.decisionNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
