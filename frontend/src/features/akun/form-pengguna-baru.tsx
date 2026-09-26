"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  peranYangBolehDibuat,
  ROLE_LABEL,
  type Role,
} from "@/core/domain/user";
import type { CreateUserCommand } from "@/core/ports/gateways";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

const KOSONG = {
  fullName: "",
  email: "",
  employeeId: "",
  position: "",
  unit: "Sekretariat Desa",
  phoneNumber: "",
  address: "",
};

/**
 * Formulir pembuatan akun perangkat desa. Identitas kepegawaian (nama, NIP,
 * jabatan, unit, email dinas) diisi sekretaris/kepala desa dari sumber
 * administrasi resmi — itulah sebabnya pengguna tidak mendaftar sendiri.
 * Telepon dan alamat boleh dikosongkan: keduanya dilengkapi sendiri oleh
 * pemilik akun saat aktivasi.
 *
 * Setelah tersimpan, sistem menerbitkan kode aktivasi sekali pakai; kata sandi
 * tidak pernah dibuatkan pengelola akun.
 */
export function FormPenggunaBaru({
  aktor,
  sedang,
  galat,
  onSimpan,
}: {
  aktor: Role;
  sedang: boolean;
  /** Galat dari lapisan data, mis. email/NIP sudah dipakai akun lain. */
  galat?: string | null;
  /** Kembalikan true bila berhasil, agar isian dibersihkan. */
  onSimpan: (command: CreateUserCommand) => Promise<boolean>;
}) {
  const [form, setForm] = useState({ ...KOSONG, role: "PERANGKAT_DESA" as Role });
  const peranTersedia = peranYangBolehDibuat(aktor);

  function ubah<K extends keyof typeof form>(kunci: K, nilai: (typeof form)[K]) {
    setForm((lama) => ({ ...lama, [kunci]: nilai }));
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const berhasil = await onSimpan({
      fullName: form.fullName,
      email: form.email,
      employeeId: form.employeeId,
      position: form.position,
      unit: form.unit,
      phoneNumber: form.phoneNumber,
      address: form.address,
      role: form.role,
    });
    if (berhasil) setForm({ ...KOSONG, role: "PERANGKAT_DESA" });
  }

  return (
    <Card>
      <CardHeader
        title="Tambah perangkat desa"
        sub="Akun dibuat sekretaris/kepala desa; yang bersangkutan mengaktivasi sendiri dengan kode undangan"
      />
      <form onSubmit={kirim} className="space-y-4 p-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama lengkap">
            <Input
              value={form.fullName}
              onChange={(e) => ubah("fullName", e.target.value)}
              placeholder="Nama sesuai SK"
              required
            />
          </Field>
          <Field label="Email dinas" hint="Dipakai untuk masuk ke aplikasi">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => ubah("email", e.target.value)}
              placeholder="nama@anabanua.id"
              required
            />
          </Field>
          <Field label="NIP / NIK administrasi" hint="Disalin dari berkas kepegawaian desa">
            <Input
              value={form.employeeId}
              onChange={(e) => ubah("employeeId", e.target.value)}
              placeholder="19870412 201003 2 004"
              className="angka-ukur"
              required
            />
          </Field>
          <Field label="Jabatan">
            <Input
              value={form.position}
              onChange={(e) => ubah("position", e.target.value)}
              placeholder="Kaur Pemerintahan"
              required
            />
          </Field>
          <Field label="Unit kerja">
            <Input
              value={form.unit}
              onChange={(e) => ubah("unit", e.target.value)}
              placeholder="Sekretariat Desa"
              required
            />
          </Field>
          <Field label="Peran" hint="Hanya akun perangkat desa yang dapat didaftarkan dari halaman ini">
            <Select
              value={form.role}
              onChange={(e) => ubah("role", e.target.value as Role)}
            >
              {peranTersedia.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Telepon (opsional)" hint="Boleh dikosongkan — dilengkapi saat aktivasi">
            <Input
              value={form.phoneNumber}
              onChange={(e) => ubah("phoneNumber", e.target.value)}
              placeholder="0852-xxxx-xxxx"
              className="angka-ukur"
            />
          </Field>
          <Field label="Alamat (opsional)">
            <Input
              value={form.address}
              onChange={(e) => ubah("address", e.target.value)}
              placeholder="Desa Anabanua, Kec. Barru"
            />
          </Field>
        </div>

        {galat ? (
          <p
            role="alert"
            className="rounded-slip border border-bahaya/30 bg-bahaya/8 px-3.5 py-2.5 text-[13px] font-medium text-bahaya"
          >
            {galat}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="gap-2" disabled={sedang}>
            <UserPlus className="h-4 w-4" />
            {sedang ? "Menyimpan…" : "Buat akun & terbitkan kode"}
          </Button>
          <p className="text-[12px] text-tinta/50">
            Kode aktivasi hanya ditampilkan sekali — salin dan serahkan kepada
            yang bersangkutan.
          </p>
        </div>
      </form>
    </Card>
  );
}