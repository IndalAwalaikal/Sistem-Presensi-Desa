"use client";

import { Copy, Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  samarkanEmail,
  sisaHariUndangan,
  type Undangan,
} from "@/core/domain/undangan";
import { Button } from "@/components/ui/button";
import { masaBerlaku, tautanAktivasi, useSalin } from "@/features/akun/use-salin";

/**
 * Kartu kode undangan: kode sekali pakai ditampilkan utuh kepada pengelola akun
 * untuk diserahkan kepada yang bersangkutan lewat jalur resmi (lisan, pesan
 * dinas). Sistem tidak pernah membuat atau menampilkan kata sandi siapa pun —
 * kata sandi hanya ditetapkan sendiri oleh pemilik akun di halaman aktivasi.
 *
 * `disorot` dipakai untuk kode yang baru saja diterbitkan, supaya langsung
 * terlihat apa yang harus diserahkan.
 */
export function KartuUndangan({
  undangan,
  disorot = false,
  className,
}: {
  undangan: Undangan;
  disorot?: boolean;
  className?: string;
}) {
  const { tersalin, gagal, salin } = useSalin();
  const sisa = sisaHariUndangan(undangan);

  return (
    <div className={cn("slip overflow-hidden", className)}>
      {disorot ? (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-emas" />
      ) : null}
      <div className="px-4 py-3.5">
        <p className="label-arsip text-tinta/45">
          Kode aktivasi — {undangan.nama}
        </p>
        <p className="angka-ukur mt-1.5 select-all text-[21px] font-semibold tracking-[0.08em]">
          {undangan.kode}
        </p>
        <p className="mt-1.5 text-[12px] leading-snug text-tinta/55">
          Sekali pakai, {masaBerlaku(sisa)}. Untuk{" "}
          {samarkanEmail(undangan.email)} — serahkan hanya kepada yang
          bersangkutan.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variasi="sekunder"
            className="gap-2"
            onClick={() => void salin("kode", undangan.kode)}
          >
            <Copy className="h-4 w-4" />
            {tersalin === "kode" ? "Kode tersalin" : "Salin kode"}
          </Button>
          <Button
            variasi="hantu"
            className="gap-2"
            onClick={() =>
              void salin("tautan", tautanAktivasi(undangan.kode))
            }
          >
            <Link2 className="h-4 w-4" />
            {tersalin === "tautan" ? "Tautan tersalin" : "Salin tautan aktivasi"}
          </Button>
        </div>

        {gagal ? (
          <p role="alert" className="mt-2.5 text-[12px] leading-snug text-bahaya">
            Peramban menolak akses papan klip. Salin kode di atas secara manual.
          </p>
        ) : null}

        <p className="angka-ukur mt-2.5 text-[11px] text-tinta/40">
          /aktivasi?kode={undangan.kode}
        </p>
      </div>
    </div>
  );
}