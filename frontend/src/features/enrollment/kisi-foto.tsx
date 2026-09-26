"use client";

import { Plus, X } from "lucide-react";
import { ENROLLMENT_MIN_PHOTOS } from "@/core/domain/enrollment";
import type { Foto } from "@/features/enrollment/tipe-foto";

/** Kisi thumbnail foto wajah dengan tombol hapus dan skor kualitas. */
export function KisiFoto({
  foto,
  onHapus,
}: {
  foto: Foto[];
  onHapus: (index: number) => void;
}) {
  const kosong = Math.max(0, ENROLLMENT_MIN_PHOTOS - foto.length);
  return (
    <div className="flex flex-wrap gap-2.5">
      {foto.map((f, i) => (
        <div key={i} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={f.dataUrl}
            alt={`Foto ${i + 1}`}
            className="h-20 w-20 rounded-slip border border-garis-folio object-cover shadow-slip"
          />
          <button
            type="button"
            aria-label={`Hapus foto ${i + 1}`}
            onClick={() => onHapus(i)}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-putih/60 bg-bahaya text-putih"
          >
            <X className="h-3 w-3" />
          </button>
          <span className="angka-ukur absolute bottom-1 left-1 rounded-tanda bg-sampul/85 px-1.5 py-0.5 text-[9.5px] font-medium text-primer-terang">
            Sampel {i + 1}
          </span>
        </div>
      ))}
      {Array.from({ length: kosong }).map((_, i) => (
        <span
          key={`kosong-${i}`}
          aria-hidden
          className="flex h-20 w-20 items-center justify-center rounded-slip border border-dashed border-garis bg-folio-2/60 text-tinta/25"
        >
          <Plus className="h-5 w-5" />
        </span>
      ))}
    </div>
  );
}
