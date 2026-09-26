package seed

import (
	"context"
	"sort"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// Kalender resmi bawaan.
//
// Sumber: SKB Menteri Agama, Menteri Ketenagakerjaan, dan Menteri PANRB
// No. 1497 Tahun 2025, No. 2 Tahun 2025, dan No. 5 Tahun 2025 tentang Hari
// Libur Nasional dan Cuti Bersama Tahun 2026 — 17 hari libur nasional dan
// 8 hari cuti bersama.
//
// Tahun berikutnya ditambahkan di sini begitu SKB-nya terbit, atau ditarik
// langsung dari sumber resmi lewat POST /api/admin/libur/impor (pengelola akun).
var hariLiburSKB = []domain.HariLibur{
	// 2026 — libur nasional
	{Tanggal: "2026-01-01", Nama: "Tahun Baru 2026 Masehi", Jenis: domain.LiburNasional},
	{Tanggal: "2026-01-16", Nama: "Isra Mikraj Nabi Muhammad saw.", Jenis: domain.LiburNasional},
	{Tanggal: "2026-02-17", Nama: "Tahun Baru Imlek 2577 Kongzili", Jenis: domain.LiburNasional},
	{Tanggal: "2026-03-19", Nama: "Hari Suci Nyepi (Tahun Baru Saka 1948)", Jenis: domain.LiburNasional},
	{Tanggal: "2026-03-21", Nama: "Hari Raya Idulfitri 1447 H", Jenis: domain.LiburNasional},
	{Tanggal: "2026-03-22", Nama: "Hari Raya Idulfitri 1447 H", Jenis: domain.LiburNasional},
	{Tanggal: "2026-04-03", Nama: "Wafat Yesus Kristus", Jenis: domain.LiburNasional},
	{Tanggal: "2026-04-05", Nama: "Kebangkitan Yesus Kristus (Paskah)", Jenis: domain.LiburNasional},
	{Tanggal: "2026-05-01", Nama: "Hari Buruh Internasional", Jenis: domain.LiburNasional},
	{Tanggal: "2026-05-14", Nama: "Kenaikan Yesus Kristus", Jenis: domain.LiburNasional},
	{Tanggal: "2026-05-27", Nama: "Hari Raya Iduladha 1447 H", Jenis: domain.LiburNasional},
	{Tanggal: "2026-05-31", Nama: "Hari Raya Waisak 2570 BE", Jenis: domain.LiburNasional},
	{Tanggal: "2026-06-01", Nama: "Hari Lahir Pancasila", Jenis: domain.LiburNasional},
	{Tanggal: "2026-06-16", Nama: "1 Muharam Tahun Baru Islam 1448 H", Jenis: domain.LiburNasional},
	{Tanggal: "2026-08-17", Nama: "Proklamasi Kemerdekaan", Jenis: domain.LiburNasional},
	{Tanggal: "2026-08-25", Nama: "Maulid Nabi Muhammad saw.", Jenis: domain.LiburNasional},
	{Tanggal: "2026-12-25", Nama: "Kelahiran Yesus Kristus", Jenis: domain.LiburNasional},

	// 2026 — cuti bersama
	{Tanggal: "2026-02-16", Nama: "Cuti Bersama Tahun Baru Imlek 2577 Kongzili", Jenis: domain.CutiBersama},
	{Tanggal: "2026-03-18", Nama: "Cuti Bersama Hari Suci Nyepi (Tahun Baru Saka 1948)", Jenis: domain.CutiBersama},
	{Tanggal: "2026-03-20", Nama: "Cuti Bersama Hari Raya Idulfitri 1447 H", Jenis: domain.CutiBersama},
	{Tanggal: "2026-03-23", Nama: "Cuti Bersama Hari Raya Idulfitri 1447 H", Jenis: domain.CutiBersama},
	{Tanggal: "2026-03-24", Nama: "Cuti Bersama Hari Raya Idulfitri 1447 H", Jenis: domain.CutiBersama},
	{Tanggal: "2026-05-15", Nama: "Cuti Bersama Kenaikan Yesus Kristus", Jenis: domain.CutiBersama},
	{Tanggal: "2026-05-28", Nama: "Cuti Bersama Hari Raya Iduladha 1447 H", Jenis: domain.CutiBersama},
	{Tanggal: "2026-12-24", Nama: "Cuti Bersama Kelahiran Yesus Kristus", Jenis: domain.CutiBersama},
}

// TahunTersedia: tahun yang punya daftar bawaan.
func TahunTersedia() []int {
	set := map[int]bool{}
	for _, h := range hariLiburSKB {
		if t := domain.TahunDariISO(h.Tanggal); t > 0 {
			set[t] = true
		}
	}
	hasil := make([]int, 0, len(set))
	for t := range set {
		hasil = append(hasil, t)
	}
	sort.Ints(hasil)
	return hasil
}

// PastikanHariLibur: semai kalender bawaan untuk tahun yang **belum** punya
// catatan sama sekali (idempoten per tahun).
//
// Tahun yang sudah terisi tidak disentuh: perubahan pengelola akun — menambah
// libur lokal, menghapus cuti bersama yang dicabut pemerintah — tidak boleh
// dipulihkan setiap server dinyalakan. Untuk memperbarui data satu tahun,
// pakai tarik ulang dari sumber resmi atau sunting di halaman Hari Libur.
func PastikanHariLibur(ctx context.Context, repo port.LiburRepo, sekarang time.Time) ([]int, error) {
	dibuat := []int{}
	for _, tahun := range TahunTersedia() {
		ada, err := repo.AdaTahun(ctx, tahun)
		if err != nil {
			return dibuat, err
		}
		if ada {
			continue
		}
		for _, h := range hariLiburSKB {
			if domain.TahunDariISO(h.Tanggal) != tahun {
				continue
			}
			h.Sumber = domain.LiburDariSKB
			if err := repo.Simpan(ctx, h, sekarang); err != nil {
				return dibuat, err
			}
		}
		dibuat = append(dibuat, tahun)
	}
	return dibuat, nil
}
