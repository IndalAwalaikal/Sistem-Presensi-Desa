"use client";

const KATA_SANDI_AKUN_CONTOH = "anabanua123";

const AKUN_CEPAT = [
  { email: "ahmad@anabanua.id", label: "Ahmad Fauzan", peran: "Perangkat Desa" },
  {
    email: "sekretaris@anabanua.id",
    label: "Rahmat Hidayat",
    peran: "Sekretaris Desa",
  },
  { email: "kepala@anabanua.id", label: "H. Abdul Malik", peran: "Kepala Desa" },
];

/**
 * Daftar akun contoh untuk demo — HANYA tampil pada mode data contoh
 * (NEXT_PUBLIC_API_MODE=mock). Pada mode bawaan seluruh kredensial dan data
 * berasal dari backend/MySQL, sehingga panel ini tidak pernah ditampilkan.
 */
export function PanelAkunContoh({ onPilih }: { onPilih: (email: string) => void }) {
  if (process.env.NEXT_PUBLIC_API_MODE !== "mock") return null;
  return (
    <div className="slip mt-8 overflow-hidden">
      <div className="kepala-berkas px-4 pb-3 pt-3.5">
        <p className="label-arsip text-tinta/45">Akun contoh — klik untuk mengisi</p>
        <span aria-hidden className="garis-kepala mt-3 block" />
      </div>
      <ul className="px-2 py-2">
        {AKUN_CEPAT.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => onPilih(a.email)}
              className="flex w-full items-center justify-between gap-3 rounded-kendali px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-folio-2"
            >
              <span className="font-semibold">{a.label}</span>
              <span className="label-arsip text-tinta/45">{a.peran}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="angka-ukur border-t border-garis-folio px-4 py-2.5 text-[11px] text-tinta/45">
        kata sandi semua akun: {KATA_SANDI_AKUN_CONTOH}
      </p>
    </div>
  );
}
