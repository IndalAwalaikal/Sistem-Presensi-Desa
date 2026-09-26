"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, CalendarX, RefreshCw } from "lucide-react";
import { useSession } from "@/providers/session";
import { bolehKelolaJadwal } from "@/core/domain/user";
import type { WorkSchedule } from "@/core/domain/attendance";
import {
  JENIS_LIBUR_LABEL,
  SUMBER_LIBUR_LABEL,
  hitungJenis,
  type HariLibur,
} from "@/core/domain/libur";
import type { HasilImporLibur, SimpanLiburCommand } from "@/core/ports/gateways";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { AksesDitolak } from "@/components/admin/akses-ditolak";
import { FormLibur } from "@/features/hari-libur/form-libur";
import { tanggalPanjang } from "@/lib/waktu";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Hari libur dikelompokkan per bulan — 25 tanggal lebih terbaca begitu. */
function kelompokkan(
  hari: readonly HariLibur[],
): Array<{ bulan: string; hari: HariLibur[] }> {
  const hasil: Array<{ bulan: string; hari: HariLibur[] }> = [];
  for (const h of hari) {
    const bulan = h.tanggal.slice(0, 7);
    const terakhir = hasil[hasil.length - 1];
    if (terakhir && terakhir.bulan === bulan) terakhir.hari.push(h);
    else hasil.push({ bulan, hari: [h] });
  }
  return hasil;
}

function labelBulan(bulan: string): string {
  return `${BULAN[Number(bulan.slice(5, 7)) - 1]} ${bulan.slice(0, 4)}`;
}

export default function HalamanHariLibur() {
  const { user, gateways } = useSession();
  const [tahun, setTahun] = useState(() => new Date().getFullYear());
  const [hari, setHari] = useState<HariLibur[] | null>(null);
  const [jadwal, setJadwal] = useState<WorkSchedule | null>(null);
  const [sedang, setSedang] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangImpor, setSedangImpor] = useState(false);
  const [hasilImpor, setHasilImpor] = useState<HasilImporLibur | null>(null);
  const [galatImpor, setGalatImpor] = useState<string | null>(null);
  /** Tanggal yang sedang menunggu penegasan hapus (dua langkah, tanpa dialog). */
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setHari(await gateways.libur.tahun(tahun));
  }, [gateways, tahun]);

  useEffect(() => {
    if (!user || !bolehKelolaJadwal(user.role)) return;
    void (async () => {
      // Kalender + jadwal dimuat bersama: jadwal hanya untuk uji mandiri pada
      // formulir — apakah tanggal yang diisi memang hari kerja kantor.
      const [kalender, cfg] = await Promise.all([
        gateways.libur.tahun(tahun),
        gateways.attendance.getActiveConfig(),
      ]);
      setHari(kalender);
      setJadwal(cfg.schedule);
    })();
  }, [user, gateways, tahun]);

  if (!user) return null;
  if (!bolehKelolaJadwal(user.role)) return <AksesDitolak />;

  async function simpan(command: SimpanLiburCommand): Promise<boolean> {
    setSedang(true);
    setGalat(null);
    setHasilImpor(null);
    try {
      await gateways.libur.simpan(command);
      await muat();
      return true;
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Hari libur gagal disimpan.");
      return false;
    } finally {
      setSedang(false);
    }
  }

  async function hapus(tanggal: string): Promise<void> {
    setSedang(true);
    setGalat(null);
    setHasilImpor(null);
    try {
      await gateways.libur.hapus(tanggal);
      setKonfirmasiHapus(null);
      await muat();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Hari libur gagal dihapus.");
    } finally {
      setSedang(false);
    }
  }

  async function impor(): Promise<void> {
    setSedangImpor(true);
    setGalatImpor(null);
    setHasilImpor(null);
    try {
      const hasil = await gateways.libur.impor(tahun);
      setHasilImpor(hasil);
      setHari([...hasil.hari]);
    } catch (err) {
      setGalatImpor(
        err instanceof Error ? err.message : "Kalender resmi gagal ditarik.",
      );
    } finally {
      setSedangImpor(false);
    }
  }

  const cacah = hari ? hitungJenis(hari) : null;

  return (
    <>
      <JudulHalaman
        judul="Kalender hari libur"
        kode="Administrasi"
        sub="Libur nasional, cuti bersama, dan libur lokal — tanggal yang tidak menuntut presensi"
        aksi={
          <div className="flex gap-2">
            <Select
              className="h-9 w-auto text-[13px]"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              aria-label="Tahun"
            >
              {[tahun - 1, tahun, tahun + 1].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Button
              variasi="sekunder"
              className="h-9 gap-2"
              disabled={sedangImpor}
              onClick={() => void impor()}
            >
              <RefreshCw className="h-4 w-4" />
              {sedangImpor ? "Menarik…" : "Tarik kalender resmi"}
            </Button>
          </div>
        }
      />
      {galat ? (
        <p
          role="alert"
          className="mb-4 rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] font-medium text-bahaya"
        >
          {galat}
        </p>
      ) : null}

      {galatImpor ? (
        <p
          role="alert"
          className="mb-4 rounded-slip border border-peringatan/35 bg-peringatan/8 px-3.5 py-2.5 text-[13px] font-medium text-peringatan"
        >
          {galatImpor}
        </p>
      ) : null}

      {hasilImpor ? (
        <p className="label-arsip mb-4 rounded-tanda border border-primer/25 bg-primer/8 px-3.5 py-2.5 text-primer">
          Kalender {hasilImpor.tahun} ditarik: {hasilImpor.baru} tanggal baru,{" "}
          {hasilImpor.diubah} diperbarui, {hasilImpor.diabaikan} catatan desa
          dipertahankan.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <FormLibur
          tahun={tahun}
          libur={hari ?? []}
          jadwal={jadwal}
          sedang={sedang}
          galat={galat}
          onSimpan={simpan}
        />

        <Card className="self-start">
          <CardHeader
            title={`Hari libur ${tahun}`}
            sub={
              cacah
                ? `${hari?.length ?? 0} tanggal · ${cacah.LIBUR_NASIONAL} libur nasional, ${cacah.CUTI_BERSAMA} cuti bersama, ${cacah.LIBUR_LOKAL} libur lokal`
                : "Memuat kalender…"
            }
          />

          {hari === null ? (
            <p className="label-arsip flex h-40 items-center justify-center gap-2 text-tinta/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primer" />
              Memuat kalender hari libur…
            </p>
          ) : hari.length === 0 ? (
            <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-tinta/50">
              <CalendarOff className="h-4 w-4" />
              Belum ada hari libur untuk tahun {tahun}.
            </p>
          ) : (
            <div className="divide-y divide-garis">
              {kelompokkan(hari).map((g) => (
                <section key={g.bulan}>
                  <h3 className="label-arsip bg-meja/50 px-4 py-2 text-tinta/45">
                    {labelBulan(g.bulan)}
                  </h3>
                  <ul className="divide-y divide-garis-folio">
                    {g.hari.map((h) => (
                      <li
                        key={h.tanggal}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3"
                      >
                        <p
                          className="angka-ukur w-24 text-[13px] font-semibold"
                          title={tanggalPanjang(h.tanggal)}
                        >
                          {h.tanggal}
                        </p>
                        <p className="min-w-0 flex-1 text-[13.5px] text-tinta">{h.nama}</p>
                        <Badge
                          nada={
                            h.jenis === "LIBUR_NASIONAL"
                              ? "info"
                              : h.jenis === "CUTI_BERSAMA"
                                ? "peringatan"
                                : "primer"
                          }
                        >
                          {JENIS_LIBUR_LABEL[h.jenis]}
                        </Badge>
                        <span className="label-arsip text-tinta/40">
                          {SUMBER_LIBUR_LABEL[h.sumber]}
                        </span>
                        {konfirmasiHapus === h.tanggal ? (
                          <span className="flex items-center gap-2">
                            <Button
                              variasi="bahaya-tombol"
                              className="h-8 gap-1.5 px-2.5 text-[12px]"
                              disabled={sedang}
                              onClick={() => void hapus(h.tanggal)}
                            >
                              <CalendarX className="h-3.5 w-3.5" /> Yakin hapus
                            </Button>
                            <button
                              type="button"
                              className="text-[12px] text-tinta/50 hover:text-tinta"
                              onClick={() => setKonfirmasiHapus(null)}
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <Button
                            variasi="bahaya-tombol"
                            className="h-8 gap-1.5 px-2.5 text-[12px]"
                            disabled={sedang}
                            onClick={() => setKonfirmasiHapus(h.tanggal)}
                          >
                            <CalendarX className="h-3.5 w-3.5" /> Hapus
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <p className="border-t border-garis px-4 py-3 text-[12px] leading-snug text-tinta/55">
            Tanggal pada daftar ini tidak menuntut presensi: tidak dihitung “tanpa
            keterangan” pada monitoring, kalender riwayat, dan rekap bulanan. Presensi
            yang tetap dilakukan di hari libur tetap tersimpan dan dihitung hadir.
          </p>
        </Card>
      </div>
    </>
  );
}
