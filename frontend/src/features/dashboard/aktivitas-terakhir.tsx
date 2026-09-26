"use client";

import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jam, relatif } from "@/lib/waktu";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_TYPE_LABEL,
  type WorkSchedule,
} from "@/core/domain/attendance";
import { kalimatSelisihTransaksi } from "@/core/usecase/attendance-status";
import type { Attendance } from "@/core/ports/gateways";
import { cn } from "@/lib/cn";

/**
 * Lini masa transaksi presensi — titik berwarna di rel vertikal.
 *
 * `jadwal` dipakai untuk menyebut durasinya, bukan hanya statusnya:
 * "terlambat 25 mnt dari batas masuk 08:00" jauh lebih berguna daripada label
 * "Terlambat". Tanpa jadwal, barisnya tetap tampil seperti semula.
 */
export function AktivitasTerakhir({
  items,
  jadwal,
}: {
  items: Attendance[];
  jadwal?: WorkSchedule | null;
}) {
  const lima = items.slice(0, 5);
  return (
    <Card>
      <CardHeader
        title="Aktivitas terakhir"
        sub="Transaksi presensi terbaru Anda"
        aksi={
          <Link
            href="/riwayat"
            className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-primer hover:underline"
          >
            Semua riwayat <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <FileText className="h-6 w-6 text-tinta/25" />
          <p className="text-sm text-tinta/50">
            Belum ada transaksi presensi bulan ini.
          </p>
          <p className="text-xs text-tinta/40">
            Transaksi pertama Anda akan tampil di sini.
          </p>
        </div>
      ) : (
        <ol className="relative px-5 py-2">
          {lima.length > 1 ? (
            <span
              aria-hidden
              className="absolute bottom-8 left-[26px] top-8 w-px bg-garis"
            />
          ) : null}
          {lima.map((a) => {
            const masuk = a.type === "CHECK_IN";
            // Durasi penyimpangan jam kerja baris ini, bila ada: "terlambat
            // 25 mnt dari batas masuk 08:00", "pulang cepat 1 jam dari jam
            // pulang 16:00".
            const kalimat = kalimatSelisihTransaksi(a, jadwal ?? null);
            return (
              <li key={a.id} className="relative flex items-start gap-4 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full",
                    // Sebelumnya kelas "bg-baca" tidak pernah ada di tema,
                    // sehingga titik presensi pulang tidak berwarna sama sekali.
                    masuk ? "bg-primer" : "bg-info",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <p className="text-[14.5px] font-semibold">
                      {ATTENDANCE_TYPE_LABEL[a.type]}
                    </p>
                    <p className="angka-ukur text-[15px] font-semibold text-tinta/80">
                      {jam(a.verification.serverTime)}
                    </p>
                    <Badge
                      className="ml-auto"
                      nada={
                        a.status === "TERLAMBAT"
                          ? "bahaya"
                          : a.status === "PULANG_CEPAT"
                            ? "peringatan"
                            : "netral"
                      }
                    >
                      {ATTENDANCE_STATUS_LABEL[a.status]}
                    </Badge>
                  </div>
                  <p className="angka-ukur mt-1 text-[11.5px] text-tinta/50">
                    {Math.round(a.verification.geofence.distanceMeters)} m dari kantor ·{" "}
                    {a.mode} · {relatif(a.verification.serverTime)}
                  </p>
                  {kalimat ? (
                    <p
                      className={cn(
                        "mt-1 text-[12px] font-semibold",
                        a.status === "TERLAMBAT"
                          ? "text-bahaya"
                          : a.status === "PULANG_CEPAT"
                            ? "text-peringatan"
                            : "text-info",
                      )}
                    >
                      {kalimat}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
