package domain

import (
	"sort"
	"strings"
	"time"
)

// ---------------------------------------------------------------------
// Kalender hari libur (libur nasional, cuti bersama, libur lokal desa)
// ---------------------------------------------------------------------
//
// Hari libur adalah bagian dari kalender desa, bukan konstanta di kode: isinya
// mengikuti SKB Hari Libur Nasional & Cuti Bersama, dapat ditarik ulang dari
// sumber resmi, dan dapat ditambah pengelola akun untuk keperluan desa (mis.
// libur lokal atau hari besar setempat).
//
// Hari libur meniadakan **kewajiban** presensi — hari itu tidak pernah dihitung
// sebagai "tanpa keterangan" — tetapi tidak melarang presensi: perangkat yang
// tetap bekerja di hari libur tetap dapat presensi dan catatannya tersimpan
// seperti biasa. Dengan begitu hari libur berperilaku sama dengan akhir pekan,
// bukan aturan baru yang berdiri sendiri.

type JenisLibur string

const (
	LiburNasional JenisLibur = "LIBUR_NASIONAL"
	CutiBersama   JenisLibur = "CUTI_BERSAMA"
	LiburLokal    JenisLibur = "LIBUR_LOKAL"
)

// Sah: hanya jenis yang dikenal yang dapat tersimpan.
func (j JenisLibur) Sah() bool {
	switch j {
	case LiburNasional, CutiBersama, LiburLokal:
		return true
	}
	return false
}

// SumberLibur: dari mana catatan libur berasal. Bedanya penting bagi kebijakan
// impor: catatan MANUAL adalah keputusan pengelola akun, jadi tidak ditimpa.
type SumberLibur string

const (
	LiburDariSKB    SumberLibur = "SKB"
	LiburDariImpor  SumberLibur = "IMPOR"
	LiburDariManual SumberLibur = "MANUAL"
)

// HariLibur: satu tanggal libur menurut kalender WITA.
type HariLibur struct {
	Tanggal string      `json:"tanggal"` // ISO "YYYY-MM-DD"
	Nama    string      `json:"nama"`
	Jenis   JenisLibur  `json:"jenis"`
	Sumber  SumberLibur `json:"sumber"`
}

// KalenderLibur: himpunan hari libur untuk pemeriksaan per tanggal.
type KalenderLibur struct{ hari map[string]HariLibur }

func KalenderLiburBaru(hari []HariLibur) *KalenderLibur {
	k := &KalenderLibur{hari: make(map[string]HariLibur, len(hari))}
	for _, h := range hari {
		if !ValidTanggalISO(h.Tanggal) {
			continue
		}
		h.Nama = strings.TrimSpace(h.Nama)
		k.hari[h.Tanggal] = h
	}
	return k
}

// Ambil: hari libur pada tanggal tersebut.
func (k *KalenderLibur) Ambil(tanggal string) (HariLibur, bool) {
	if k == nil {
		return HariLibur{}, false
	}
	h, ada := k.hari[tanggal]
	return h, ada
}

// Libur: apakah tanggal itu hari libur. Aman dipanggil pada kalender kosong
// (`nil`), sehingga pemanggil yang belum memuat kalender tidak perlu memeriksa.
func (k *KalenderLibur) Libur(tanggal string) bool {
	_, ada := k.Ambil(tanggal)
	return ada
}

// Semua: seluruh hari libur, terurut menurut tanggal.
func (k *KalenderLibur) Semua() []HariLibur {
	if k == nil {
		return []HariLibur{}
	}
	hasil := make([]HariLibur, 0, len(k.hari))
	for _, h := range k.hari {
		hasil = append(hasil, h)
	}
	sort.Slice(hasil, func(i, j int) bool { return hasil[i].Tanggal < hasil[j].Tanggal })
	return hasil
}

// Jumlah: banyaknya hari libur pada kalender.
func (k *KalenderLibur) Jumlah() int {
	if k == nil {
		return 0
	}
	return len(k.hari)
}

// HariKerjaEfektif: apakah `t` hari kerja — menurut jadwal **dan** bukan hari
// libur. Inilah satu-satunya pemeriksaan hari kerja yang dipakai penilaian
// kedisiplinan (rekap bulanan, monitoring harian, kalender riwayat).
func HariKerjaEfektif(jadwal WorkSchedule, kalender *KalenderLibur, t time.Time) bool {
	if !jadwal.IsWorkDay(t) {
		return false
	}
	return !kalender.Libur(TanggalISO(t))
}

// ValidTanggalISO: "YYYY-MM-DD" yang benar-benar ada di kalender.
func ValidTanggalISO(s string) bool {
	t, err := time.Parse("2006-01-02", s)
	return err == nil && t.Format("2006-01-02") == s
}

// TahunDariISO: tahun dari tanggal ISO; 0 bila tidak sah.
func TahunDariISO(s string) int {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return 0
	}
	return t.Year()
}

// RingkasLibur: satu baris hari libur untuk pesan log audit.
func RingkasLibur(h HariLibur) string {
	return h.Tanggal + " — " + h.Nama + " (" + string(h.Jenis) + ")"
}
