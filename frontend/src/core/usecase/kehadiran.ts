/**
 * Aturan hari kerja "tutup buku" dan hari **tanpa keterangan**.
 *
 * Satu tempat untuk keputusan yang dipakai monitoring harian, rekap bulanan, dan
 * kalender riwayat — paralel dengan aturan domain Go
 * (`HariKerjaTertutup` / `TanpaKeterangan`), supaya mode contoh tidak pernah
 * berbeda pendapat dengan server.
 *
 * Sebelum ini sistem hanya mengenal dua keadaan, hadir dan terlambat: perangkat
 * yang sama sekali tidak melakukan presensi tidak muncul di mana pun. Hari kerja
 * yang batas masuknya sudah lewat, tanpa presensi masuk, dan tanpa pengajuan yang
 * menjelaskan (izin/sakit/cuti disetujui) kini dihitung sebagai **tanpa
 * keterangan**. WFH dan dinas luar tetap wajib presensi — sama dengan aturan
 * ringkasan monitoring harian.
 */

import type { WorkSchedule } from "@/core/domain/attendance";
import type { WorkRequest } from "@/core/domain/requests";
import { menutupKehadiran } from "@/core/domain/requests";
import { jamISO, menitDari, tanggalISO } from "@/lib/waktu";

/** 0 = Minggu … 6 = Sabtu dari tanggal ISO — tanpa bergantung zona perangkat. */
export function hariDariIso(iso: string): number {
  const [tahun, bulan, tanggal] = iso.split("-").map(Number);
  return new Date(Date.UTC(tahun, bulan - 1, tanggal)).getUTCDay();
}

/** Apakah tanggal ISO termasuk hari kerja menurut jadwal yang berlaku. */
export function isHariKerjaIso(jadwal: WorkSchedule, iso: string): boolean {
  return jadwal.workDays.includes(hariDariIso(iso));
}

/**
 * Apakah tanggal ISO termasuk hari kerja **efektif** — menurut jadwal dan bukan
 * hari libur (nasional, cuti bersama, lokal). Paralel dengan
 * `domain.HariKerjaEfektif` backend: hari libur meniadakan kewajiban presensi.
 */
export function isHariKerjaEfektifIso(
  jadwal: WorkSchedule,
  libur: ReadonlySet<string> | undefined,
  iso: string,
): boolean {
  return isHariKerjaIso(jadwal, iso) && !libur?.has(iso);
}

/** Batas masuk hari ini sudah lewat? (waktu resmi: WITA) */
export function lewatBatasMasuk(jadwal: WorkSchedule, sekarang: Date): boolean {
  return menitDari(jamISO(sekarang)) >= menitDari(jadwal.checkInDeadline);
}

/** Tanggal ISO dari komponen tahun/bulan/tanggal — tanpa zona waktu perangkat. */
function isoDari(tahun: number, bulan: number, tanggal: number): string {
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(tanggal).padStart(2, "0")}`;
}

/** Jumlah hari pada bulan tersebut (bulan 1–12). */
function jumlahHariBulan(tahun: number, bulan: number): number {
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

/**
 * Hari kerja **efektif** (menurut jadwal dan bukan hari libur) dari awal bulan
 * sampai `sampaiIso` (inklusif).
 *
 * Dipakai sebagai penyebut \"hari hadir dari N hari kerja\" pada dashboard: hari
 * ini ikut dihitung walau batas masuknya belum lewat, karena presensi hari ini
 * masih dapat dilakukan. Hari libur tidak menambah kewajiban, jadi tidak
 * menambah penyebut — dengan begitu perangkat yang tidak presensi di hari libur
 * tidak terbaca sebagai kurang rajin.
 */
export function hariKerjaBulan(
  tahun: number,
  bulan: number,
  jadwal: WorkSchedule,
  libur: ReadonlySet<string> | undefined,
  sampaiIso: string,
): string[] {
  const hasil: string[] = [];
  for (let tanggal = 1; tanggal <= jumlahHariBulan(tahun, bulan); tanggal++) {
    const iso = isoDari(tahun, bulan, tanggal);
    if (iso > sampaiIso) break;
    if (isHariKerjaEfektifIso(jadwal, libur, iso)) hasil.push(iso);
  }
  return hasil;
}

/**
 * Hari kerja dalam satu bulan yang batas masuknya sudah lewat pada `sekarang`.
 *
 * Hanya hari inilah yang dapat dinilai tanpa keterangan: hari yang batas
 * masuknya belum lewat masih dapat diisi presensi, dan bulan yang belum berjalan
 * tidak menghasilkan apa pun. Hari libur (nasional, cuti bersama, lokal)
 * dikecualikan — tidak pernah menjadi tanpa keterangan.
 */
export function hariKerjaTertutup(
  tahun: number,
  bulan: number,
  jadwal: WorkSchedule,
  libur: ReadonlySet<string> | undefined,
  sekarang: Date,
): string[] {
  const hariIni = tanggalISO(sekarang);
  const lewatHariIni = lewatBatasMasuk(jadwal, sekarang);
  const hasil: string[] = [];
  for (let tanggal = 1; tanggal <= jumlahHariBulan(tahun, bulan); tanggal++) {
    const iso = isoDari(tahun, bulan, tanggal);
    if (!isHariKerjaEfektifIso(jadwal, libur, iso)) continue;
    if (iso < hariIni || (iso === hariIni && lewatHariIni)) hasil.push(iso);
  }
  return hasil;
}

/**
 * Tanggal (ISO) yang ditutup pengajuan disetujui yang menjelaskan
 * ketidakhadiran — izin/sakit/cuti, bukan WFH/dinas luar.
 */
export function hariDijelaskan(pengajuan: readonly WorkRequest[]): Set<string> {
  const hasil = new Set<string>();
  for (const r of pengajuan) {
    if (r.status !== "DISETUJUI" || !menutupKehadiran(r.type)) continue;
    const mulai = new Date(`${r.startDate}T00:00:00+08:00`).getTime();
    const selesai = new Date(`${r.endDate}T00:00:00+08:00`).getTime();
    if (Number.isNaN(mulai) || Number.isNaN(selesai) || selesai < mulai) continue;
    for (let t = mulai; t <= selesai; t += 86_400_000) {
      hasil.add(tanggalISO(new Date(t)));
    }
  }
  return hasil;
}

/**
 * Jumlah HARI KERJA efektif dalam satu bulan yang dicakup pengajuan bertipe
 * `tipe` — paralel `domain.HariPengajuanBulan` pada backend.
 *
 * Rekap melaporkan berapa hari perangkat diizinkan tidak hadir, bukan berapa
 * berkas pengajuan: satu cuti lima hari berarti lima hari, dan pengajuan lintas
 * bulan tetap menyumbang hari-hari yang jatuh di bulan ini. Hanya hari kerja
 * efektif yang dihitung, sehingga izin yang jatuh pada akhir pekan atau hari
 * libur tidak menambah angkanya.
 */
export function hitungHariPengajuanBulan(bahan: {
  readonly pengajuan: readonly WorkRequest[];
  readonly tipe: WorkRequest["type"];
  readonly tahun: number;
  readonly bulan: number;
  readonly jadwal: WorkSchedule;
  /** Himpunan tanggal ISO hari libur — dikecualikan dari hari kerja. */
  readonly libur?: ReadonlySet<string>;
}): number {
  const hari = hariDijelaskan(bahan.pengajuan.filter((r) => r.type === bahan.tipe));
  let n = 0;
  for (const iso of hari) {
    const [tahun, bulan] = iso.split("-").map(Number);
    if (tahun !== bahan.tahun || bulan !== bahan.bulan) continue;
    if (isHariKerjaEfektifIso(bahan.jadwal, bahan.libur, iso)) n++;
  }
  return n;
}

export interface BahanTanpaKeterangan {
  readonly tahun: number;
  readonly bulan: number;
  readonly jadwal: WorkSchedule;
  /** Himpunan tanggal ISO hari libur — yang dikecualikan dari kewajiban. */
  readonly libur?: ReadonlySet<string>;
  readonly sekarang: Date;
  /** Tanggal (ISO) yang punya presensi masuk. */
  readonly hadir: ReadonlySet<string>;
  /** Tanggal (ISO) yang sudah dijelaskan pengajuan disetujui. */
  readonly dijelaskan: ReadonlySet<string>;
  /** Tanggal (ISO) akun dibuat — hari kerja sebelumnya tidak dihitung. */
  readonly sejak?: string;
}

/**
 * Jumlah hari kerja tertutup dalam satu bulan yang tanpa presensi masuk dan tanpa
 * penjelasan. `sejak` (tanggal akun dibuat) mencegah perangkat baru tercatat alpa
 * untuk hari-hari sebelum ia bergabung.
 */
export function tanpaKeteranganBulan(bahan: BahanTanpaKeterangan): number {
  const { hadir, dijelaskan, sejak } = bahan;
  return hariKerjaTertutup(bahan.tahun, bahan.bulan, bahan.jadwal, bahan.libur, bahan.sekarang).filter(
    (t) => !(sejak && t < sejak) && !hadir.has(t) && !dijelaskan.has(t),
  ).length;
}
