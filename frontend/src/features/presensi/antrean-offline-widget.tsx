"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useSession } from "@/providers/session";
import {
  ambilSemuaAntrean,
  hapusAntrean,
  sinkronkanAntrean,
  type ItemAntreanPresensi,
} from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AntreanOfflineWidgetProps {
  onSyncSukses?: () => void;
}

export function AntreanOfflineWidget({ onSyncSukses }: AntreanOfflineWidgetProps) {
  const { gateways } = useSession();
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [antrean, setAntrean] = useState<ItemAntreanPresensi[]>([]);
  const [sedangSinkron, setSedangSinkron] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const muatAntrean = useCallback(async () => {
    try {
      const items = await ambilSemuaAntrean();
      setAntrean(items);
    } catch {
      // Abaikan bila di lingkungan non-browser
    }
  }, []);

  const jalankanSinkron = useCallback(async () => {
    if (sedangSinkron) return;
    setSedangSinkron(true);
    setPesan(null);
    try {
      const res = await sinkronkanAntrean(gateways);
      await muatAntrean();
      if (res.berhasil > 0) {
        setPesan(`${res.berhasil} presensi berhasil dikirim ke server.`);
        onSyncSukses?.();
      } else if (res.gagal > 0) {
        setPesan(`Sinkronisasi sebagian gagal: ${res.rincian.join(", ")}`);
      }
    } catch (err) {
      setPesan(err instanceof Error ? err.message : "Gagal sinkronisasi antrean.");
    } finally {
      setSedangSinkron(false);
    }
  }, [gateways, muatAntrean, onSyncSukses, sedangSinkron]);

  useEffect(() => {
    void muatAntrean();

    function handleOnline() {
      setOnline(true);
      void jalankanSinkron();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Interval cek antrean berkala
    const interval = setInterval(() => {
      void muatAntrean();
    }, 8000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [jalankanSinkron, muatAntrean]);

  if (online && antrean.length === 0 && !pesan) {
    return null;
  }

  return (
    <div className="rounded-slip border border-garis bg-folio-2/80 p-4 space-y-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {online ? (
            <Badge nada="primer" className="gap-1 text-[11px]">
              <Wifi className="h-3 w-3" />
              <span>Online</span>
            </Badge>
          ) : (
            <Badge nada="bahaya" className="gap-1 text-[11px] animate-pulse">
              <WifiOff className="h-3 w-3" />
              <span>Mode Offline</span>
            </Badge>
          )}

          <span className="text-xs font-semibold text-tinta">
            {antrean.length > 0
              ? `${antrean.length} Presensi Tersimpan di Antrean Lokal`
              : "Jaringan kembali online"}
          </span>
        </div>

        {antrean.length > 0 && online && (
          <Button
            type="button"
            variasi="utama"
            onClick={jalankanSinkron}
            disabled={sedangSinkron}
            className="h-7 text-xs gap-1.5 px-2.5"
          >
            <RefreshCw className={`h-3 w-3 ${sedangSinkron ? "animate-spin" : ""}`} />
            <span>{sedangSinkron ? "Menyinkronkan…" : "Kirim Sekarang"}</span>
          </Button>
        )}
      </div>

      {!online && (
        <p className="text-[12px] text-tinta/70 leading-snug">
          Jaringan internet sedang terputus. Anda tetap dapat melakukan presensi dengan kamera & GPS — sistem akan menyimpannya dengan aman di memori lokal peramban (IndexedDB) dan mengunggahnya otomatis begitu sinyal kembali.
        </p>
      )}

      {pesan && (
        <p className="rounded border border-primer/30 bg-primer/10 px-3 py-1.5 text-xs text-primer flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{pesan}</span>
        </p>
      )}

      {antrean.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {antrean.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded border border-garis bg-folio px-3 py-2 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-tinta">
                    {item.type === "CHECK_IN" ? "Presensi Masuk" : "Presensi Pulang"} ({item.mode})
                  </span>
                  <Badge
                    nada={
                      item.status === "MENYINKRONKAN"
                        ? "info"
                        : item.status === "GAGAL"
                        ? "bahaya"
                        : "peringatan"
                    }
                    className="text-[10px]"
                  >
                    {item.status}
                  </Badge>
                </div>
                <div className="text-[11px] text-tinta/50 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>
                    Dicatat:{" "}
                    {new Date(item.waktuPencatatan).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {item.pesanGalat && (
                    <span className="text-bahaya italic">({item.pesanGalat})</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (confirm("Hapus antrean presensi ini?")) {
                    await hapusAntrean(item.id);
                    await muatAntrean();
                  }
                }}
                className="text-tinta/40 hover:text-bahaya p-1"
                aria-label="Hapus antrean"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
