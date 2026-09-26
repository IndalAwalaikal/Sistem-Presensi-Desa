"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ENROLLMENT_STATUS_LABEL } from "@/core/domain/enrollment";
import type { FaceEnrollment } from "@/core/domain/enrollment";

/** Tampilan ketika pendaftaran wajah sudah berjalan/disetujui. */
export function StatusPendaftaran({ enrollment }: { enrollment: FaceEnrollment }) {
  const nada =
    enrollment.status === "APPROVED"
      ? "primer"
      : enrollment.status === "SUBMITTED"
        ? "peringatan"
        : "netral";
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader
        title="Status pendaftaran"
        sub={
          enrollment.submittedAt
            ? `Dikirim ${new Date(enrollment.submittedAt).toLocaleString("id-ID")}`
            : undefined
        }
      />
      <div className="p-4">
        <Badge nada={nada}>{ENROLLMENT_STATUS_LABEL[enrollment.status]}</Badge>
        <p className="mt-3 text-[13.5px] leading-6 text-tinta/65">
          {enrollment.status === "APPROVED"
            ? "Biometrik Anda aktif. Presensi kamera siap digunakan di dalam area kantor."
            : "Sekretaris desa akan memverifikasi pendaftaran Anda. Presensi terbuka setelah disetujui."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {enrollment.photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={p.dataUrl}
              alt={`Foto wajah ${i + 1}`}
              className="h-16 w-16 rounded-slip border border-garis-folio object-cover shadow-slip"
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
