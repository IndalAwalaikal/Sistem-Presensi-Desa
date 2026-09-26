package domain

import "time"

// ---------------------------------------------------------------------
// Laporan: agregat bulanan untuk rekap kedisiplinan
// ---------------------------------------------------------------------

// RekapBulanan: agregat presensi per pengguna (dipakai repositori).
type RekapBulanan struct {
	Hadir     int
	Terlambat int
	// TerlambatMenit/PulangCepatMenit: total durasi pelanggaran jam kerja pada
	// bulan itu. Angka "berapa kali" saja tidak menjawab "lambat berapa lama" —
	// dua angka ini yang menjawabnya, dihitung dari waktu server setiap transaksi
	// terhadap ambang jadwal yang berlaku.
	TerlambatMenit   int
	PulangCepatMenit int
}

// MenitDisiplin: total durasi penyimpangan jam kerja dari satu deret transaksi.
// Satu tempat untuk aturan "lambat berapa menit" dan "pulang cepat berapa menit"
// di server — paralel dengan `ringkasanSelisihBulan` pada frontend.
type MenitDisiplin struct {
	Terlambat   int
	PulangCepat int
}

// Tambah: jumlahkan satu transaksi ke total.
//
// Selisih menit yang dijumlahkan adalah yang TERSIMPAN pada transaksi
// (`Attendance.SelisihMenit`, dinilai terhadap jadwal saat transaksi dicatat)
// — bukan hitung ulang dari jadwal aktif. Inilah yang menjaga jumlah kejadian
// (status) dan total durasi tetap sependapat walau jadwal diubah di tengah
// bulan: keduanya memakai sumber yang sama.
//
// Baris lama yang dicatat sebelum kolom selisih ada menyimpan 0 — untuk itu
// dipakai fallback hitung ulang dari jadwal aktif supaya tidak selalu nol.
// Aturan statusnya tetap dipegang: hanya TERLAMBAT (menit setelah batas masuk)
// dan PULANG_CEPAT (menit sebelum jam pulang) yang dijumlahkan.
func (m *MenitDisiplin) Tambah(jadwal WorkSchedule, jenis AttendanceType, status AttendanceStatus, serverTime time.Time) {
	m.TambahTersimpan(jadwal, jenis, status, serverTime, 0, false)
}

// TambahTersimpan: seperti Tambah, tetapi memakai selisih tersimpan bila
// `ada` (transaksi baru yang selisihnya sudah dicatat saat presensi).
func (m *MenitDisiplin) TambahTersimpan(jadwal WorkSchedule, jenis AttendanceType, status AttendanceStatus, serverTime time.Time, tersimpan int, ada bool) {
	sel := tersimpan
	if !ada || sel == 0 {
		sel = selisihHitungUlang(jadwal, jenis, serverTime)
	}
	switch jenis {
	case CheckIn:
		if status != Terlambat {
			return
		}
		if sel > 0 {
			m.Terlambat += sel
		}
	case CheckOut:
		if status != PulangCepat {
			return
		}
		if sel < 0 {
			m.PulangCepat += -sel
		}
	}
}

// selisihHitungUlang: fallback untuk baris lama — hitung dari jadwal aktif.
func selisihHitungUlang(jadwal WorkSchedule, jenis AttendanceType, serverTime time.Time) int {
	if jenis == CheckIn {
		return EvaluateCheckIn(jadwal, serverTime).DeltaMenit
	}
	return EvaluateCheckOut(jadwal, serverTime).DeltaMenit
}

// HariPengajuanBulan: jumlah hari kerja **efektif** dalam satu bulan yang
// dicakup pengajuan per pengguna & jenis.
//
// Dua hal yang tidak dapat dijawab `COUNT(*)` pengajuan, dan dijawab di sini:
//
//   - satu pengajuan cuti lima hari menutup lima hari kerja, bukan satu hari;
//   - pengajuan yang mulai akhir bulan lalu dan baru berakhir di bulan ini
//     tetap menyumbang hari-hari yang jatuh di bulan ini — kueri
//     `YEAR(mulai)/MONTH(mulai)` membuat cuti lintas bulan hilang sama sekali
//     dari rekap bulan berjalan.
//
// Hanya hari kerja efektif yang dihitung (menurut jadwal dan bukan hari libur):
// izin yang kebetulan jatuh pada akhir pekan atau libur nasional tidak menambah
// angka izin — sejalan dengan "tanpa keterangan" yang juga tidak menuntut
// presensi di hari-hari itu. Rentang rusak/terbalik diabaikan (`HariTercakup`
// mengembalikan daftar kosong).
//
// `pengajuan` diisi pengajuan DISETUJUI yang rentangnya bersinggungan dengan
// bulan ini (termasuk yang menggulung dari bulan sebelumnya).
func HariPengajuanBulan(tahun, bulan int, jadwal WorkSchedule, kalender *KalenderLibur, pengajuan []WorkRequest) map[string]map[RequestType]int {
	hariKerja := map[string]bool{}
	awal := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, WITA)
	akhir := awal.AddDate(0, 1, -1)
	for d := awal; !d.After(akhir); d = d.AddDate(0, 0, 1) {
		if HariKerjaEfektif(jadwal, kalender, d) {
			hariKerja[TanggalISO(d)] = true
		}
	}

	hasil := map[string]map[RequestType]int{}
	for _, r := range pengajuan {
		n := 0
		for _, tanggal := range r.HariTercakup() {
			if hariKerja[tanggal] {
				n++
			}
		}
		if n == 0 {
			continue
		}
		if hasil[r.UserID] == nil {
			hasil[r.UserID] = map[RequestType]int{}
		}
		hasil[r.UserID][r.Type] += n
	}
	return hasil
}

// MonthlyRecapRow: bentuk rekap bulanan yang dikonsumsi frontend.
type MonthlyRecapRow struct {
	UserID     string `json:"userId"`
	UserName   string `json:"userName"`
	EmployeeID string `json:"employeeId"`
	Position   string `json:"position"`
	Hadir      int    `json:"hadir"`
	Terlambat  int    `json:"terlambat"`
	Izin       int    `json:"izin"`
	Sakit      int    `json:"sakit"`
	Cuti       int    `json:"cuti"`
	// TanpaKeterangan: jumlah hari kerja yang sudah tutup buku tanpa presensi
	// masuk dan tanpa pengajuan yang menjelaskan ketidakhadiran. Inilah satu-satunya
	// angka yang menunjukkan perangkat "tidak melakukan presensi" — sebelumnya
	// rekap hanya mengenal hadir dan terlambat, sehingga hari yang dilewati tanpa
	// kabar sama sekali tidak terlihat.
	TanpaKeterangan int `json:"tanpaKeterangan"`
	// TerlambatMenit/PulangCepatMenit: total durasi, bukan jumlah kejadian —
	// "3 kali terlambat" menjadi "3 kali terlambat, total 1 jam 25 menit".
	TerlambatMenit   int `json:"terlambatMenit"`
	PulangCepatMenit int `json:"pulangCepatMenit"`
}

// ---------------------------------------------------------------------
// Hari kerja tertutup & tanpa keterangan
// ---------------------------------------------------------------------

// HariKerjaTertutup: tanggal (ISO, WITA) dalam satu bulan yang merupakan hari
// kerja **dan** batas masuknya sudah lewat pada `sekarang`.
//
// Hanya tanggal inilah yang dapat dinilai "tanpa keterangan": hari yang batas
// masuknya belum lewat masih bisa diisi presensi, jadi belum boleh dihitung
// sebagai pelanggaran. Hari ini yang belum lewat batas juga tidak masuk daftar.
//
// `kalender` boleh `nil` (belum dimuat): hari libur pada kalender itu dikecualikan
// sehingga libur nasional, cuti bersama, dan libur lokal tidak pernah menjadi
// tanpa keterangan.
func HariKerjaTertutup(tahun, bulan int, jadwal WorkSchedule, kalender *KalenderLibur, sekarang time.Time) []string {
	hariIni := TanggalISO(sekarang)
	lewatHariIni := jamMenitWITA(sekarang) >= MenitOf(jadwal.CheckInDeadline)

	awal := time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, WITA)
	akhir := awal.AddDate(0, 1, -1)
	hasil := []string{}
	for d := awal; !d.After(akhir); d = d.AddDate(0, 0, 1) {
		if !HariKerjaEfektif(jadwal, kalender, d) {
			continue
		}
		iso := TanggalISO(d)
		switch {
		case iso < hariIni:
			hasil = append(hasil, iso)
		case iso == hariIni && lewatHariIni:
			hasil = append(hasil, iso)
		}
	}
	return hasil
}

// TanpaKeterangan: banyaknya hari kerja tertutup yang tidak punya presensi masuk
// dan tidak ditutup pengajuan yang menjelaskan ketidakhadiran.
//
//   - `hariKerja` berasal dari HariKerjaTertutup,
//   - `hadir`/`izin` adalah himpunan tanggal (ISO) milik satu pengguna,
//   - `sejak` (ISO, boleh kosong) adalah tanggal akun dibuat: hari kerja sebelum
//     akun ada tidak dihitung, supaya perangkat baru tidak langsung tercatat
//     alpa untuk hari-hari sebelum ia bergabung.
func TanpaKeterangan(hariKerja []string, hadir, izin map[string]bool, sejak string) int {
	n := 0
	for _, t := range hariKerja {
		if sejak != "" && t < sejak {
			continue
		}
		if hadir[t] || izin[t] {
			continue
		}
		n++
	}
	return n
}
