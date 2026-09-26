package domain_test

import (
	"testing"
	"time"

	"presensi-anabanua/backend/internal/domain"
)

// Hari kerja tertutup: hanya hari kerja yang batas masuknya sudah lewat yang
// boleh dinilai — hari yang belum tutup buku masih dapat diisi presensi.
func TestHariKerjaTertutup(t *testing.T) {
	j := jadwalDemo() // hari kerja Senin–Sabtu, batas masuk 08:00
	liburKosong := domain.KalenderLiburBaru(nil)

	kasus := []struct {
		nama     string
		jam      int
		menit    int
		harapan  int
		terakhir string
	}{
		// 10 September 2026 (Kamis) — September 2026: 6 & 13 = Minggu.
		{"sebelum batas masuk, hari ini belum ditutup", 7, 30, 8, "2026-09-09"},
		{"tepat batas masuk sudah ditutup", 8, 0, 9, "2026-09-10"},
		{"setelah batas masuk", 9, 0, 9, "2026-09-10"},
	}
	for _, k := range kasus {
		h := domain.HariKerjaTertutup(2026, 9, j, liburKosong, waktuDemi(k.jam, k.menit))
		if len(h) != k.harapan {
			t.Fatalf("%s: dapat %d hari (%v), ingin %d", k.nama, len(h), h, k.harapan)
		}
		if h[len(h)-1] != k.terakhir {
			t.Fatalf("%s: hari terakhir %s, ingin %s", k.nama, h[len(h)-1], k.terakhir)
		}
		for _, tgl := range h {
			if tgl == "2026-09-06" || tgl == "2026-09-13" {
				t.Fatalf("%s: Minggu harus dilewati: %v", k.nama, h)
			}
		}
	}

	// Bulan yang belum berjalan tidak punya hari tertutup sama sekali.
	if h := domain.HariKerjaTertutup(2026, 10, j, liburKosong, waktuDemi(9, 0)); len(h) != 0 {
		t.Fatalf("bulan depan seharusnya kosong: %v", h)
	}

	// Jadwal Senin–Jumat: Sabtu ikut dilewati.
	j.WorkDays = []int{1, 2, 3, 4, 5}
	h := domain.HariKerjaTertutup(2026, 9, j, liburKosong, waktuDemi(9, 0))
	for _, tgl := range h {
		if tgl == "2026-09-05" || tgl == "2026-09-12" {
			t.Fatalf("Sabtu bukan hari kerja pada jadwal ini: %v", h)
		}
	}
	// Hari libur ikut dilewati meski jatuh pada hari kerja.
	libur := domain.KalenderLiburBaru([]domain.HariLibur{
		{Tanggal: "2026-09-07", Nama: "Libur Lokal", Jenis: domain.LiburLokal},
		{Tanggal: "2026-09-09", Nama: "Libur Nasional", Jenis: domain.LiburNasional},
	})
	if h := domain.HariKerjaTertutup(2026, 9, j, libur, waktuDemi(9, 0)); len(h) != 6 {
		t.Fatalf("hari libur seharusnya dilewati: %v", h)
	}
}

// Durasi penyimpangan jam kerja: rekap yang hanya berkata "3 kali terlambat"
// tidak menjawab "lambat berapa menit" — `MenitDisiplin` yang menjawabnya.
// Yang dijumlahkan hanyalah transaksi berstatus TERLAMBAT (menit setelah batas
// masuk) dan PULANG_CEPAT (menit sebelum jam pulang); transaksi tepat waktu,
// datang lebih awal, atau pulang dalam rentang jam kerja tidak menambah apa pun.
func TestMenitDisiplinTambah(t *testing.T) {
	j := jadwalDemo() // batas masuk 08:00, jam pulang 16:00, batas pulang 17:00
	total := domain.MenitDisiplin{}

	total.Tambah(j, domain.CheckIn, domain.Terlambat, waktuDemi(8, 25))  // 25 menit
	total.Tambah(j, domain.CheckIn, domain.Terlambat, waktuDemi(9, 0))   // 60 menit
	total.Tambah(j, domain.CheckIn, domain.Terlambat, waktuDemi(8, 0))   // tepat batas: 0
	total.Tambah(j, domain.CheckIn, domain.TepatWaktu, waktuDemi(9, 30)) // status tidak cocok
	total.Tambah(j, domain.CheckIn, domain.TepatWaktu, waktuDemi(7, 15)) // datang lebih awal

	if total.Terlambat != 85 {
		t.Fatalf("total keterlambatan seharusnya 85 menit, dapat %d", total.Terlambat)
	}

	total.Tambah(j, domain.CheckOut, domain.PulangCepat, waktuDemi(15, 30)) // 30 menit
	total.Tambah(j, domain.CheckOut, domain.PulangCepat, waktuDemi(16, 0))  // tepat jam pulang: 0
	total.Tambah(j, domain.CheckOut, domain.LebihKerja, waktuDemi(17, 40))  // lebih kerja, bukan pulang cepat
	total.Tambah(j, domain.CheckOut, domain.TepatWaktu, waktuDemi(16, 30))  // dalam rentang

	if total.PulangCepat != 30 {
		t.Fatalf("pulang cepat seharusnya 30 menit, dapat %d", total.PulangCepat)
	}
}

func TestTanpaKeterangan(t *testing.T) {
	hariKerja := []string{"2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"}
	hadir := map[string]bool{"2026-09-01": true}
	izin := map[string]bool{"2026-09-03": true}

	// 4 hari tertutup: 1 hadir, 1 dijelaskan izin → 2 hari tanpa keterangan.
	if n := domain.TanpaKeterangan(hariKerja, hadir, izin, ""); n != 2 {
		t.Fatalf("tanpa keterangan: %d, ingin 2", n)
	}

	// Akun baru (dibuat 3 September): hari sebelum akun ada tidak dihitung.
	if n := domain.TanpaKeterangan(hariKerja, hadir, izin, "2026-09-03"); n != 1 {
		t.Fatalf("sejak 3 September: %d, ingin 1", n)
	}

	// Tanpa bahan apa pun, semua hari kerja tertutup dihitung.
	if n := domain.TanpaKeterangan(hariKerja, nil, nil, ""); n != 4 {
		t.Fatalf("tanpa presensi sama sekali: %d, ingin 4", n)
	}
}

// WFH dan dinas luar tetap wajib presensi; hanya izin/sakit/cuti yang menutup
// kewajiban presensi sehari.
// Selisih tersimpan: rekap memakai angka yang dicatat saat presensi,
// sehingga perubahan jadwal di tengah bulan tidak mengubah durasi lama.
func TestMenitDisiplinTersimpan(t *testing.T) {
	j := jadwalDemo()
	total := domain.MenitDisiplin{}
	// Transaksi dicatat saat batas masuk 08:00 (25 menit) - jadwal kini
	// sudah berubah ke 13:00, tetapi durasinya tetap 25 menit.
	jBaru := j
	jBaru.CheckInDeadline = "13:00"
	total.TambahTersimpan(jBaru, domain.CheckIn, domain.Terlambat, waktuDemi(8, 25), 25, true)
	if total.Terlambat != 25 {
		t.Fatalf("selisih tersimpan 25 menit harus dipakai, dapat %d", total.Terlambat)
	}
	// Baris lama (selisih 0): fallback hitung ulang dari jadwal aktif.
	total.TambahTersimpan(j, domain.CheckIn, domain.Terlambat, waktuDemi(8, 25), 0, true)
	if total.Terlambat != 50 {
		t.Fatalf("baris lama harus dihitung ulang (25+25=50), dapat %d", total.Terlambat)
	}
	// Status tidak cocok tetap tidak menambah apa pun.
	total.TambahTersimpan(j, domain.CheckIn, domain.TepatWaktu, waktuDemi(9, 30), 90, true)
	if total.Terlambat != 50 {
		t.Fatalf("status tepat waktu tidak boleh menambah: %d", total.Terlambat)
	}
}

func TestMenutupKehadiran(t *testing.T) {
	menutup := []domain.RequestType{domain.ReqIzin, domain.ReqSakit, domain.ReqCuti}
	terbuka := []domain.RequestType{domain.ReqWFH, domain.ReqDinasLuar, domain.ReqKoreksiPresen}
	for _, tipe := range menutup {
		if !tipe.MenutupKehadiran() {
			t.Errorf("%s seharusnya menutup kewajiban presensi", tipe)
		}
	}
	for _, tipe := range terbuka {
		if tipe.MenutupKehadiran() {
			t.Errorf("%s seharusnya tetap wajib presensi", tipe)
		}
	}
}

// HariPengajuanBulan: yang dilaporkan pada rekap adalah HARI KERJA nyata yang
// dicakup pengajuan — bukan banyaknya berkas pengajuan (COUNT(*) lama), dan
// bukan hanya pengajuan yang MULAI di bulan itu (kueri YEAR(mulai)/MONTH(mulai)
// lama membuat cuti lintas bulan hilang dari rekap bulan berjalan).
func TestHariPengajuanBulan(t *testing.T) {
	j := jadwalDemo() // Senin–Sabtu, batas masuk 08:00 (September 2026: 6 & 13 Minggu)
	kosong := domain.KalenderLiburBaru(nil)

	pengajuan := []domain.WorkRequest{
		// Empat hari kerja di September (4, 5, 7, 8); 6 Minggu tidak dihitung.
		{Type: domain.ReqCuti, UserID: "usr-1", StartDate: "2026-09-04", EndDate: "2026-09-08"},
		// Lintas bulan: hanya 1 & 2 September yang jatuh di bulan ini.
		{Type: domain.ReqSakit, UserID: "usr-1", StartDate: "2026-08-30", EndDate: "2026-09-02"},
		// Hanya Minggu (13 September 2026): tidak menyumbang hari kerja.
		{Type: domain.ReqIzin, UserID: "usr-2", StartDate: "2026-09-13", EndDate: "2026-09-13"},
		// Rentang rusak/terbalik: diabaikan, bukan menuduh alpa.
		{Type: domain.ReqCuti, UserID: "usr-3", StartDate: "2026-09-20", EndDate: "2026-09-01"},
	}
	hari := domain.HariPengajuanBulan(2026, 9, j, kosong, pengajuan)

	if n := hari["usr-1"][domain.ReqCuti]; n != 4 {
		t.Fatalf("cuti usr-1 seharusnya 4 hari kerja, dapat %d (%v)", n, hari)
	}
	if n := hari["usr-1"][domain.ReqSakit]; n != 2 {
		t.Fatalf("sakit lintas bulan seharusnya 2 hari di September, dapat %d", n)
	}
	if _, ada := hari["usr-2"]; ada {
		t.Fatalf("pengajuan akhir pekan tidak boleh dihitung: %v", hari)
	}
	if _, ada := hari["usr-3"]; ada {
		t.Fatalf("rentang terbalik tidak boleh dihitung: %v", hari)
	}

	// Hari libur tidak menuntut presensi, jadi tidak menambah angka izin:
	// 7 September (Senin) menjadi libur nasional → cuti usr-1 tinggal 3 hari.
	libur := domain.KalenderLiburBaru([]domain.HariLibur{
		{Tanggal: "2026-09-07", Nama: "Libur Nasional", Jenis: domain.LiburNasional},
	})
	hariLibur := domain.HariPengajuanBulan(2026, 9, j, libur, pengajuan)
	if n := hariLibur["usr-1"][domain.ReqCuti]; n != 3 {
		t.Fatalf("hari libur seharusnya tidak menambah izin: dapat %d", n)
	}
}

// Mode pengajuan: WFH dan dinas luar tetap menuntut presensi, jadi keduanya
// membawa mode; izin/sakit/cuti menutup hari, dan koreksi presensi tidak
// memindahkan lokasi kerja — keduanya tidak punya mode.
func TestModeTerbukaPengajuan(t *testing.T) {
	kasus := map[domain.RequestType]domain.AttendanceMode{
		domain.ReqWFH:       domain.ModeWFH,
		domain.ReqDinasLuar: domain.ModeDinasLuar,
	}
	for tipe, mode := range kasus {
		dapat, ok := tipe.ModeTerbuka()
		if !ok || dapat != mode {
			t.Errorf("%s seharusnya bermode %s, dapat %q (ok=%v)", tipe, mode, dapat, ok)
		}
		if !dapat.WajibPengajuan() {
			t.Errorf("mode %s seharusnya menuntut pengajuan", dapat)
		}
	}
	for _, tipe := range []domain.RequestType{domain.ReqIzin, domain.ReqSakit, domain.ReqCuti, domain.ReqKoreksiPresen} {
		if mode, ok := tipe.ModeTerbuka(); ok {
			t.Errorf("%s tidak boleh punya mode terbuka, dapat %q", tipe, mode)
		}
	}
	// Mode WFO selalu sah tanpa pengajuan; WFH/dinas luar tidak.
	if domain.ModeWFO.WajibPengajuan() {
		t.Error("WFO tidak boleh menuntut pengajuan")
	}
}

func TestHariTercakupPengajuan(t *testing.T) {
	r := domain.WorkRequest{StartDate: "2026-09-04", EndDate: "2026-09-06"}
	hari := r.HariTercakup()
	if len(hari) != 3 || hari[0] != "2026-09-04" || hari[2] != "2026-09-06" {
		t.Fatalf("rentang 3 hari: %v", hari)
	}

	// Rentang terbalik atau rusak menghasilkan daftar kosong, bukan tuduhan alpa.
	rusak := []domain.WorkRequest{
		{StartDate: "2026-09-06", EndDate: "2026-09-04"},
		{StartDate: "", EndDate: "2026-09-04"},
		{StartDate: "bukan-tanggal", EndDate: "2026-09-04"},
	}
	for _, x := range rusak {
		if len(x.HariTercakup()) != 0 {
			t.Errorf("rentang %q–%q seharusnya kosong: %v", x.StartDate, x.EndDate, x.HariTercakup())
		}
	}
}

// Batas hari kerja: hari ini pukul 07:30 belum ditutup, pukul 08:00 sudah.
func TestHariKerjaTertutupBatasHariIni(t *testing.T) {
	j := jadwalDemo()
	liburBatas := domain.KalenderLiburBaru(nil)
	kini := time.Date(2026, 9, 10, 7, 59, 0, 0, domain.WITA)
	if h := domain.HariKerjaTertutup(2026, 9, j, liburBatas, kini); len(h) != 8 {
		t.Fatalf("07:59 seharusnya belum menutup hari ini: %v", h)
	}
	kini = time.Date(2026, 9, 10, 8, 0, 0, 0, domain.WITA)
	if h := domain.HariKerjaTertutup(2026, 9, j, liburBatas, kini); len(h) != 9 {
		t.Fatalf("08:00 seharusnya sudah menutup hari ini: %v", h)
	}
}

// Hari libur (nasional, cuti bersama, lokal) tidak pernah menjadi hari
// tertutup — walau jatuh pada hari kerja jadwal — sehingga tidak dihitung
// tanpa keterangan.
func TestHariLiburBukanTanpaKeterangan(t *testing.T) {
	j := jadwalDemo()
	libur := domain.KalenderLiburBaru([]domain.HariLibur{
		{Tanggal: "2026-03-19", Nama: "Hari Suci Nyepi", Jenis: domain.LiburNasional},
		{Tanggal: "2026-03-20", Nama: "Cuti Bersama Nyepi", Jenis: domain.CutiBersama},
		{Tanggal: "2026-03-21", Nama: "Hari Raya Idulfitri", Jenis: domain.LiburNasional},
		{Tanggal: "2026-03-25", Nama: "Acara Adat Desa", Jenis: domain.LiburLokal},
	})

	// 23 Maret 2026 (Senin): 19–21 Maret harus sudah tersaring.
	kini := time.Date(2026, 3, 23, 9, 0, 0, 0, domain.WITA)
	h := domain.HariKerjaTertutup(2026, 3, j, libur, kini)
	dalam := map[string]bool{}
	for _, tgl := range h {
		dalam[tgl] = true
	}
	for _, lepas := range []string{"2026-03-19", "2026-03-20", "2026-03-21"} {
		if dalam[lepas] {
			t.Fatalf("%s hari libur tetapi masuk hari tertutup: %v", lepas, h)
		}
	}
	if !dalam["2026-03-18"] {
		t.Fatalf("hari kerja biasa harus tetap tertutup: %v", h)
	}
	if !libur.Libur("2026-03-25") || libur.Libur("2026-03-18") {
		t.Fatal("KalenderLibur.Libur salah menilai tanggal")
	}
}
