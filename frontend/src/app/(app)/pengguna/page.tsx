"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/providers/session";
import { isAdminRole, type AccountStatus, type Role, type User } from "@/core/domain/user";
import { undanganSah, type Undangan } from "@/core/domain/undangan";
import type { CreateUserCommand } from "@/core/ports/gateways";
import { JudulHalaman } from "@/components/ui/judul-halaman";
import { Card, CardHeader } from "@/components/ui/card";
import { AksesDitolak } from "@/components/admin/akses-ditolak";
import { FormPenggunaBaru } from "@/features/akun/form-pengguna-baru";
import { DaftarPengguna } from "@/features/akun/daftar-pengguna";
import { KartuUndangan } from "@/features/akun/kartu-undangan";

const URUTAN_ROLE: Record<Role, number> = {
  PERANGKAT_DESA: 0,
  SEKRETARIS_DESA: 1,
  KEPALA_DESA: 2,
};

/**
 * Register pengguna — halaman sekretaris/kepala desa. Di sinilah akun perangkat
 * desa dibuat (bukan didaftarkan sendiri oleh yang bersangkutan), kode aktivasi
 * diterbitkan/diterbitkan ulang, dan akun yang tidak lagi aktif dinonaktifkan.
 * Setiap tindakan tercatat pada log audit.
 */
export default function HalamanPengguna() {
  const { user, gateways } = useSession();
  const [pengguna, setPengguna] = useState<User[]>([]);
  const [undangan, setUndangan] = useState<Undangan[]>([]);
  const [sedang, setSedang] = useState<string | null>(null);
  /** Galat pembuatan akun — ditampilkan di dalam formulir. */
  const [galatForm, setGalatForm] = useState<string | null>(null);
  /** Galat tindakan pada daftar (reset kode/ubah status) — ditampilkan di atas. */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Kode yang baru diterbitkan — ditampilkan menonjol agar segera diserahkan. */
  const [kodeBaru, setKodeBaru] = useState<Undangan | null>(null);

  const muat = useCallback(async () => {
    if (!user || !isAdminRole(user.role)) return;
    const [daftar, kode] = await Promise.all([
      gateways.admin.listAllUsers(),
      gateways.admin.listUndangan(),
    ]);
    setPengguna(daftar);
    setUndangan(kode);
  }, [user, gateways]);

  useEffect(() => {
    void (async () => {
      await muat();
    })();
  }, [muat]);

  async function jalankan(
    kunci: string,
    aksi: () => Promise<string>,
  ): Promise<boolean> {
    setGalatAksi(null);
    setInfo(null);
    setSedang(kunci);
    try {
      setInfo(await aksi());
      await muat();
      return true;
    } catch (err) {
      setGalatAksi(err instanceof Error ? err.message : "Tindakan gagal.");
      return false;
    } finally {
      setSedang(null);
    }
  }

  async function simpan(cmd: CreateUserCommand): Promise<boolean> {
    setGalatForm(null);
    setInfo(null);
    setSedang("baru");
    try {
      const hasil = await gateways.admin.createUser(cmd);
      setKodeBaru(hasil.undangan);
      setInfo(
        `Akun ${hasil.user.fullName} dibuat tanpa kata sandi. Serahkan kode aktivasi di bawah kepada yang bersangkutan.`,
      );
      await muat();
      return true;
    } catch (err) {
      setGalatForm(err instanceof Error ? err.message : "Akun gagal dibuat.");
      return false;
    } finally {
      setSedang(null);
    }
  }

  async function resetSandi(p: User) {
    await jalankan(p.id, async () => {
      const hasil = await gateways.admin.resetPassword(p.id);
      setKodeBaru(hasil.undangan);
      return `Kode aktivasi baru untuk ${p.fullName} diterbitkan; kata sandi lama tidak berlaku lagi.`;
    });
  }

  async function ubahStatus(p: User, status: AccountStatus) {
    await jalankan(p.id, async () => {
      await gateways.admin.setAccountStatus(p.id, status);
      return status === "AKTIF"
        ? `Akun ${p.fullName} diaktifkan kembali.`
        : `Akun ${p.fullName} dinonaktifkan; kode undangan yang belum dipakai ikut gugur.`;
    });
  }

  if (!user) return null;
  if (!isAdminRole(user.role)) return <AksesDitolak />;

  const terurut = [...pengguna].sort(
    (a, b) =>
      URUTAN_ROLE[a.role] - URUTAN_ROLE[b.role] ||
      a.fullName.localeCompare(b.fullName),
  );
  const jumlah = (status: AccountStatus) =>
    pengguna.filter((p) => p.accountStatus === status).length;
  const kodeBerlaku = undangan.filter((d) => undanganSah(d)).length;

  return (
    <>
      <JudulHalaman
        judul="Pengguna"
        kode="Administrasi"
        sub="Akun perangkat desa dibuat sekretaris/kepala desa, lalu diaktivasi pemiliknya dengan kode undangan"
      />

      {info ? (
        <p className="mb-4 rounded-slip border border-primer/30 bg-primer/8 px-4 py-2.5 text-[13px] font-medium text-primer">
          {info}
        </p>
      ) : null}
      {galatAksi ? (
        <p
          role="alert"
          className="mb-4 rounded-slip border border-bahaya/30 bg-bahaya/8 px-4 py-2.5 text-[13px] font-medium text-bahaya"
        >
          {galatAksi}
        </p>
      ) : null}

      {kodeBaru ? (
        <KartuUndangan undangan={kodeBaru} disorot className="mb-5" />
      ) : null}

      <div className="space-y-5">
        <FormPenggunaBaru
          aktor={user.role}
          sedang={sedang === "baru"}
          galat={galatForm}
          onSimpan={simpan}
        />

        <Card>
          <CardHeader
            title="Daftar pengguna"
            sub={`${pengguna.length} akun · ${jumlah("AKTIF")} aktif · ${jumlah(
                "UNDANGAN",
              )} menunggu aktivasi · ${jumlah("NONAKTIF")} nonaktif`}
            aksi={
              <span className="label-arsip text-tinta/45">
                {kodeBerlaku} kode berlaku
              </span>
            }
          />
          <DaftarPengguna
            pengguna={terurut}
            undangan={undangan}
            aktor={user.role}
            aktorId={user.id}
            sedang={sedang}
            onResetSandi={(p) => void resetSandi(p)}
            onUbahStatus={(p, status) => void ubahStatus(p, status)}
          />
        </Card>
      </div>
    </>
  );
}