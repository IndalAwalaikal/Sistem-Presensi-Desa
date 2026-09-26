"use client";

import { History, Clock, MapPin, Calendar, User } from "lucide-react";
import type { AuditLog } from "@/core/domain/requests";
import { Card, CardHeader } from "@/components/ui/card";
import { formatWaktuWITA } from "@/lib/waktu";

interface TimelineKonfigurasiProps {
  logs: readonly AuditLog[];
}

export function TimelineKonfigurasi({ logs }: TimelineKonfigurasiProps) {
  const logsAman = Array.isArray(logs) ? logs : [];
  // Filter audit logs yang berhubungan dengan konfigurasi jadwal & kantor
  const konfigurasiLogs = logsAman.filter((l) =>
    [
      "MENGUBAH_JADWAL",
      "MENGUBAH_KANTOR",
      "MENAMBAH_JADWAL_KHUSUS",
      "MENGHAPUS_JADWAL_KHUSUS",
    ].includes(l.action),
  );

  function iconAksi(aksi: string) {
    switch (aksi) {
      case "MENGUBAH_JADWAL":
        return <Clock className="h-4 w-4 text-primer" />;
      case "MENGUBAH_KANTOR":
        return <MapPin className="h-4 w-4 text-peringatan" />;
      case "MENAMBAH_JADWAL_KHUSUS":
        return <Calendar className="h-4 w-4 text-info" />;
      case "MENGHAPUS_JADWAL_KHUSUS":
        return <Calendar className="h-4 w-4 text-bahaya" />;
      default:
        return <History className="h-4 w-4 text-tinta/50" />;
    }
  }

  function labelAksi(aksi: string) {
    switch (aksi) {
      case "MENGUBAH_JADWAL":
        return "Perubahan Jam Kerja";
      case "MENGUBAH_KANTOR":
        return "Perubahan Lokasi / Geofence";
      case "MENAMBAH_JADWAL_KHUSUS":
        return "Penambahan Jadwal Khusus";
      case "MENGHAPUS_JADWAL_KHUSUS":
        return "Penghapusan Jadwal Khusus";
      default:
        return aksi;
    }
  }

  return (
    <Card>
      <CardHeader
        title="Riwayat & Jejak Audit Konfigurasi"
        sub="Kronologi perubahan patokan jam kerja, radius kantor, dan jadwal khusus desa"
      />

      <div className="p-5 sm:p-6">
        {konfigurasiLogs.length === 0 ? (
          <p className="py-6 text-center text-xs text-tinta/50">
            Belum ada catatan riwayat perubahan konfigurasi jadwal atau kantor.
          </p>
        ) : (
          <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-garis">
            {konfigurasiLogs.map((log) => (
              <div key={log.id} className="relative group">
                {/* Node Bulat */}
                <div className="absolute -left-6 sm:-left-8 top-1 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full border border-garis bg-folio shadow-xs">
                  {iconAksi(log.action)}
                </div>

                <div className="rounded-slip border border-garis bg-folio-2/50 p-3.5 sm:p-4 transition-colors hover:bg-folio-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-xs text-tinta flex items-center gap-1.5">
                      {labelAksi(log.action)}
                    </span>
                    <span className="angka-ukur text-[11px] text-tinta/45">
                      {formatWaktuWITA(log.at)} WITA
                    </span>
                  </div>

                  <p className="text-xs text-tinta/80 leading-relaxed font-sans">
                    {log.detail}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-garis-folio flex items-center justify-between text-[11px] text-tinta/50">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{log.actorName}</span>
                    </span>
                    <span className="font-mono text-[10px] text-tinta/40">
                      ID: {log.targetId}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
