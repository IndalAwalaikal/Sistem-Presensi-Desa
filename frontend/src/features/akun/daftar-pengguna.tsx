"use client";

import { Ban, CircleCheck, Copy, KeyRound } from "lucide-react";
import {
  ACCOUNT_STATUS_LABEL,
  BIOMETRIC_LABEL,
  bolehKelolaAkun,
  ROLE_LABEL,
  type AccountStatus,
  type BiometricStatus,
  type Role,
  type User,
} from "@/core/domain/user";
import { sisaHariUndangan, undanganSah, type Undangan } from "@/core/domain/undangan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { masaBerlaku, useSalin } from "@/features/akun/use-salin";

const NADA_AKUN: Record<AccountStatus, "primer" | "peringatan" | "bahaya"> = {
  AKTIF: "primer",
  UNDANGAN: "peringatan",
  NONAKTIF: "bahaya",
};

const NADA_BIOMETRIK: Record<
  BiometricStatus,
  "primer" | "peringatan" | "bahaya" | "netral"
> = {
  ACTIVE: "primer",
  PENDING_VERIFICATION: "peringatan",
  REJECTED: "bahaya",
  EXPIRED: "bahaya",
  NOT_ENROLLED: "netral",
};

/**
 * Daftar perangkat desa beserta status akun dan biometriknya. Setiap baris
 * menyediakan tindakan yang memang menjadi kewenangan sekretaris/kepala desa:
 * menerbitkan kode aktivasi baru (untuk yang belum aktivasi maupun yang lupa
 * kata sandi), serta menonaktifkan/mengaktifkan kembali akun.
 */
export function DaftarPengguna({
  pengguna,
  undangan,
  aktor,
  aktorId,
  sedang,
  onResetSandi,
  onUbahStatus,
}: {
  pengguna: User[];
  undangan: Undangan[];
  aktor: Role;
  aktorId: string;
  /** Id pengguna yang sedang diproses agar tombolnya tidak ditekan dua kali. */
  sedang: string | null;
  onResetSandi: (pengguna: User) => void;
  onUbahStatus: (pengguna: User, status: AccountStatus) => void;
}) {
  return (
    <ul className="divide-y divide-garis">
      {pengguna.map((u) => {
        const kode = undangan.find((d) => d.userId === u.id && undanganSah(d));
        const sendiri = u.id === aktorId;
        const boleh = !sendiri && bolehKelolaAkun(aktor, u.role);
        const sibuk = sedang === u.id;

        return (
          <BarisPengguna
            key={u.id}
            pengguna={u}
            kode={kode}
            sendiri={sendiri}
            boleh={boleh}
            sibuk={sibuk}
            onResetSandi={() => onResetSandi(u)}
            onUbahStatus={(status) => onUbahStatus(u, status)}
          />
        );
      })}
    </ul>
  );
}

function BarisPengguna({
  pengguna: u,
  kode,
  sendiri,
  boleh,
  sibuk,
  onResetSandi,
  onUbahStatus,
}: {
  pengguna: User;
  kode?: Undangan;
  sendiri: boolean;
  boleh: boolean;
  sibuk: boolean;
  onResetSandi: () => void;
  onUbahStatus: (status: AccountStatus) => void;
}) {
  const { tersalin, salin } = useSalin();
  const aktif = u.accountStatus === "AKTIF";

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">
            {u.fullName}
            {sendiri ? <span className="text-tinta/40"> · akun Anda</span> : null}
          </p>
          <p className="angka-ukur mt-0.5 text-[12px] text-tinta/50">{u.email}</p>
          <p className="mt-1 text-[12.5px] text-tinta/60">
            {u.official.position} · {u.official.unit}
          </p>
          <p className="angka-ukur mt-0.5 text-[11px] text-tinta/40">
            NIP {u.official.employeeId || "—"} ·{" "}
            {u.official.phoneNumber || "telepon belum diisi"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-arsip text-tinta/45">{ROLE_LABEL[u.role]}</span>
          <Badge nada={NADA_AKUN[u.accountStatus]}>
            {ACCOUNT_STATUS_LABEL[u.accountStatus]}
          </Badge>
          <Badge nada={NADA_BIOMETRIK[u.biometricStatus]}>
            {BIOMETRIC_LABEL[u.biometricStatus]}
          </Badge>
        </div>
      </div>

      {kode ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-kendali border border-peringatan/25 bg-peringatan/6 px-3 py-2">
          <span className="label-arsip text-peringatan">Kode aktif</span>
          <span className="angka-ukur select-all text-[14px] font-semibold tracking-[0.06em]">
            {kode.kode}
          </span>
          <span className="text-[12px] text-tinta/55">
            {masaBerlaku(sisaHariUndangan(kode))}
          </span>
          <Button
            variasi="hantu"
            className="gap-1.5 px-2.5"
            onClick={() => void salin(`kode-${u.id}`, kode.kode)}
          >
            <Copy className="h-4 w-4" />
            {tersalin === `kode-${u.id}` ? "Tersalin" : "Salin"}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variasi="sekunder"
          className="gap-2"
          disabled={!boleh || sibuk}
          onClick={onResetSandi}
        >
          <KeyRound className="h-4 w-4" />
          {u.accountStatus === "UNDANGAN" ? "Terbitkan kode baru" : "Reset kata sandi"}
        </Button>

        {aktif ? (
          <Button
            variasi="bahaya-tombol"
            className="gap-2"
            disabled={!boleh || sibuk}
            onClick={() => onUbahStatus("NONAKTIF")}
          >
            <Ban className="h-4 w-4" />
            Nonaktifkan
          </Button>
        ) : (
          <Button
            variasi="sekunder"
            className="gap-2"
            disabled={!boleh || sibuk}
            onClick={() => onUbahStatus("AKTIF")}
          >
            <CircleCheck className="h-4 w-4" />
            Aktifkan
          </Button>
        )}

        {!boleh && !sendiri ? (
          <p className="self-center text-[12px] text-tinta/45">
            Hanya akun perangkat desa yang dapat dikelola dari halaman ini.
          </p>
        ) : null}
      </div>
    </li>
  );
}