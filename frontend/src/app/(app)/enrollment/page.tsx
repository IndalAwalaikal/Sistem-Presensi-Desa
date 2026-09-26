"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Plus, Send } from "lucide-react";
import { useSession } from "@/providers/session";
import type { FaceEnrollment } from "@/core/domain/enrollment";
import { ENROLLMENT_MAX_PHOTOS, ENROLLMENT_MIN_PHOTOS } from "@/core/domain/enrollment";
import { useKamera } from "@/lib/use-kamera";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PanelKamera } from "@/features/presensi/panel-kamera";
import { StatusPendaftaran } from "@/features/enrollment/status-pendaftaran";
import { KisiFoto } from "@/features/enrollment/kisi-foto";
import type { Foto } from "@/features/enrollment/tipe-foto";

export default function HalamanEnrollment() {
  const { user, gateways, segarkan } = useSession();
  const kamera = useKamera();
  const [enrollment, setEnrollment] = useState<FaceEnrollment | null>(null);
  const [foto, setFoto] = useState<Foto[]>([]);
  const [mengirim, setMengirim] = useState(false);
  const [memeriksaFoto, setMemeriksaFoto] = useState(false);
  const validasiSedang = useRef(false);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!user) return;
    setEnrollment(await gateways.enrollment.getMine(user.id));
  }, [user, gateways]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  const jepret = useCallback(async () => {
    if (!user || validasiSedang.current || foto.length >= ENROLLMENT_MAX_PHOTOS) return;
    const dataUrl = kamera.tangkap();
    if (!dataUrl) return;
    validasiSedang.current = true;
    setMemeriksaFoto(true);
    setGalat(null);
    try {
      await gateways.enrollment.validatePhoto(dataUrl);
      setFoto((lama) =>
        lama.length >= ENROLLMENT_MAX_PHOTOS
          ? lama
          : [...lama, { dataUrl, capturedAt: new Date().toISOString() }],
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Foto ditolak. Pastikan satu wajah terlihat jelas, cukup terang, fokus, dan di tengah bingkai.");
    } finally {
      validasiSedang.current = false;
      setMemeriksaFoto(false);
    }
  }, [kamera, user, gateways, foto.length]);

  async function kirim() {
    if (!user || foto.length < ENROLLMENT_MIN_PHOTOS) return;
    setMengirim(true);
    setGalat(null);
    try {
      await gateways.enrollment.submit(user.id, { photos: foto });
      await segarkan();
      await muat();
      kamera.hentikan();
      setFoto([]);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pengiriman gagal.");
    } finally {
      setMengirim(false);
    }
  }

  if (!user) return null;

  if (enrollment && enrollment.status !== "REJECTED") {
    return (
      <>
        <JudulHalaman judul="Pendaftaran wajah" kode="Biometrik" />
        <StatusPendaftaran enrollment={enrollment} />
      </>
    );
  }

  return (
    <>
      <JudulHalaman
        judul="Pendaftaran wajah"
        kode="Biometrik"
        sub="Ambil 3–5 foto dengan satu wajah terlihat jelas dan pencahayaan baik — semua foto dipakai menyusun template"
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <PanelKamera
          videoRef={kamera.videoRef}
          status={kamera.status}
          pesan={kamera.pesan}
          onUlangi={() => void kamera.mulai()}
          langkah={[
            { label: "Kamera aktif & wajah dalam bingkai", selesai: kamera.status === "aktif" },
            {
              label: `Foto terkumpul (${foto.length}/${ENROLLMENT_MIN_PHOTOS} min)`,
              selesai: foto.length >= ENROLLMENT_MIN_PHOTOS,
            },
            { label: "Dikirim untuk verifikasi admin", selesai: false },
          ]}
          berjalan={false}
        />

        <Card>
          <CardHeader
            title="Foto wajah"
            sub="Variasikan sedikit: hadap lurus, senyum tipis, kepala miring kecil"
          />
          <div className="p-4">
            <KisiFoto foto={foto} onHapus={(i) => setFoto((lama) => lama.filter((_, j) => j !== i))} />

            {galat ? (
              <p role="alert" className="mt-3 rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] text-bahaya">
                {galat}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => void jepret()} disabled={kamera.status !== "aktif" || foto.length >= ENROLLMENT_MAX_PHOTOS || memeriksaFoto} className="gap-2">
                <Plus className="h-4 w-4" /> {memeriksaFoto ? "Memeriksa foto…" : "Ambil foto"}
              </Button>
              {kamera.status === "aktif" ? (
                <Button variasi="sekunder" onClick={() => kamera.hentikan()}>
                  Tutup kamera
                </Button>
              ) : (
                <Button onClick={() => void kamera.mulai()} className="gap-2">
                  <Check className="h-4 w-4" /> Buka kamera
                </Button>
              )}
              <Button
                onClick={() => void kirim()}
                disabled={foto.length < ENROLLMENT_MIN_PHOTOS || mengirim}
                className="ml-auto gap-2"
              >
                <Send className="h-4 w-4" />
                {mengirim ? "Mengirim…" : "Kirim verifikasi"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
