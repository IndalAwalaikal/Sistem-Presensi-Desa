"use client";

import { useState } from "react";
import { Calendar, Plus, Trash2, Clock } from "lucide-react";
import type { JadwalKhusus, CreateJadwalKhususCommand } from "@/core/domain/attendance";
import { HARI_LABEL, URUTAN_HARI } from "@/core/domain/attendance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

interface FormJadwalKhususProps {
  daftar: readonly JadwalKhusus[];
  sedang: boolean;
  onTambah: (cmd: CreateJadwalKhususCommand) => Promise<boolean>;
  onHapus: (id: string) => Promise<void>;
}

export function FormJadwalKhusus({
  daftar,
  sedang,
  onTambah,
  onHapus,
}: FormJadwalKhususProps) {
  const daftarAman = Array.isArray(daftar) ? daftar : [];
  const [bukaForm, setBukaForm] = useState(false);
  const [nama, setNama] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [checkInStart, setCheckInStart] = useState("08:00");
  const [checkInDeadline, setCheckInDeadline] = useState("08:30");
  const [checkOutStart, setCheckOutStart] = useState("15:00");
  const [checkOutEnd, setCheckOutEnd] = useState("15:30");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [galat, setGalat] = useState<string | null>(null);

  const hariIni = new Date().toISOString().slice(0, 10);

  function toggleHari(h: number) {
    setWorkDays((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    );
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setGalat(null);
    if (!nama.trim()) {
      setGalat("Nama jadwal khusus wajib diisi.");
      return;
    }
    if (!startDate || !endDate) {
      setGalat("Tanggal mulai dan selesai wajib dipilih.");
      return;
    }
    if (startDate > endDate) {
      setGalat("Tanggal mulai tidak boleh melewati tanggal selesai.");
      return;
    }
    if (workDays.length === 0) {
      setGalat("Pilih minimal satu hari kerja.");
      return;
    }

    const sukses = await onTambah({
      name: nama.trim(),
      startDate,
      endDate,
      checkInStart,
      checkInDeadline,
      checkOutStart,
      checkOutEnd,
      workDays,
    });

    if (sukses) {
      setNama("");
      setStartDate("");
      setEndDate("");
      setBukaForm(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Jadwal Khusus (Ramadan / Shift / Khusus)"
        sub="Penyesuaian jam kerja untuk rentang waktu tertentu yang otomatis menimpa jadwal utama"
        aksi={
          <Button
            variasi="sekunder"
            onClick={() => setBukaForm((b) => !b)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{bukaForm ? "Tutup Form" : "Tambah Jadwal Khusus"}</span>
          </Button>
        }
      />

      <div className="p-5 sm:p-6 space-y-5">
        {bukaForm && (
          <form
            onSubmit={handleSimpan}
            className="rounded-slip border border-garis bg-folio-2/70 p-4 sm:p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-tinta flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primer" />
              Tetapkan Jadwal Khusus Baru
            </h3>

            {galat && (
              <p className="rounded border border-bahaya/30 bg-bahaya/10 px-3 py-2 text-xs text-bahaya">
                {galat}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="label-arsip block mb-1">Nama Jadwal Khusus</label>
                <Input
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Mis. Ramadan 1447 H"
                  required
                />
              </div>
              <div>
                <label className="label-arsip block mb-1">Tanggal Mulai</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label-arsip block mb-1">Tanggal Selesai</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <div>
                <label className="label-arsip block mb-1">Jam Masuk</label>
                <Input
                  type="time"
                  value={checkInStart}
                  onChange={(e) => setCheckInStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label-arsip block mb-1">Batas Masuk</label>
                <Input
                  type="time"
                  value={checkInDeadline}
                  onChange={(e) => setCheckInDeadline(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label-arsip block mb-1">Jam Pulang</label>
                <Input
                  type="time"
                  value={checkOutStart}
                  onChange={(e) => setCheckOutStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label-arsip block mb-1">Batas Pulang</label>
                <Input
                  type="time"
                  value={checkOutEnd}
                  onChange={(e) => setCheckOutEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <span className="label-arsip block mb-2">Hari Kerja Berlaku</span>
              <div className="flex flex-wrap gap-2">
                {URUTAN_HARI.map((h) => {
                  const terpilih = workDays.includes(h);
                  return (
                    <button
                      type="button"
                      key={h}
                      onClick={() => toggleHari(h)}
                      className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        terpilih
                          ? "border-primer bg-primer text-white font-medium shadow-sm"
                          : "border-garis bg-folio text-tinta/60 hover:border-tinta/30"
                      }`}
                    >
                      {HARI_LABEL[h]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-garis">
              <Button
                type="button"
                variasi="sekunder"
                onClick={() => setBukaForm(false)}
                disabled={sedang}
              >
                Batal
              </Button>
              <Button type="submit" disabled={sedang}>
                {sedang ? "Menyimpan…" : "Simpan Jadwal Khusus"}
              </Button>
            </div>
          </form>
        )}

        {daftarAman.length === 0 ? (
          <p className="py-6 text-center text-xs text-tinta/50">
            Belum ada jadwal khusus yang ditambahkan. Sistem memakai jam kerja reguler.
          </p>
        ) : (
          <div className="space-y-3">
            {daftarAman.map((jk) => {
              const aktif = jk.startDate <= hariIni && hariIni <= jk.endDate;
              const mendatang = hariIni < jk.startDate;
              return (
                <div
                  key={jk.id}
                  className={`rounded-slip border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    aktif
                      ? "border-primer/40 bg-primer/5"
                      : "border-garis bg-folio-2/40"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-tinta text-sm">{jk.name}</h4>
                      {aktif && (
                        <Badge nada="primer" className="text-[11px]">
                          Sedang Aktif Hari Ini
                        </Badge>
                      )}
                      {mendatang && (
                        <Badge nada="info" className="text-[11px]">
                          Akan Datang
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-tinta/60 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {jk.startDate} s/d {jk.endDate}
                      </span>
                      <span>•</span>
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {jk.checkInStart}–{jk.checkInDeadline} & {jk.checkOutStart}–{jk.checkOutEnd}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {URUTAN_HARI.filter((h) => jk.workDays.includes(h)).map((h) => (
                        <span
                          key={h}
                          className="rounded border border-garis bg-folio px-1.5 py-0.5 text-[10px] text-tinta/70"
                        >
                          {HARI_LABEL[h]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variasi="bahaya"
                    className="self-end sm:self-center h-8 px-2.5 text-xs gap-1"
                    onClick={() => {
                      if (confirm(`Hapus jadwal khusus "${jk.name}"?`)) {
                        void onHapus(jk.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus</span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
