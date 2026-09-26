package domain_test

import (
	"strings"
	"testing"
	"time"

	"presensi-anabanua/backend/internal/domain"
)

func waktuDemi(jam, menit int) time.Time {
	// 10 September 2026 = Selasa (hari kerja)
	return time.Date(2026, 9, 10, jam, menit, 0, 0, domain.WITA)
}

func jadwalDemo() domain.WorkSchedule {
	return domain.WorkSchedule{
		ID: "sch-1", Name: "Jadwal Kantor (domain.WITA)",
		CheckInStart: "07:30", CheckInDeadline: "08:00",
		CheckOutStart: "16:00", CheckOutEnd: "17:00",
		WorkDays: []int{1, 2, 3, 4, 5, 6},
	}
}

func TestEvaluateCheckIn(t *testing.T) {
	j := jadwalDemo()
	kasus := []struct {
		jam, menit int
		status     domain.AttendanceStatus
	}{
		{7, 29, domain.TepatWaktu}, // lebih awal
		{7, 59, domain.TepatWaktu},
		{8, 0, domain.TepatWaktu}, // tepat batas masih tepat waktu
		{8, 1, domain.Terlambat},  // satu menit lewat = terlambat
		{10, 0, domain.Terlambat}, // jauh terlambat
	}
	for _, k := range kasus {
		h := domain.EvaluateCheckIn(j, waktuDemi(k.jam, k.menit))
		if h.Status != k.status {
			t.Errorf("CheckIn %02d:%02d: dapat %s, ingin %s", k.jam, k.menit, h.Status, k.status)
		}
	}
}

func TestEvaluateCheckOut(t *testing.T) {
	j := jadwalDemo()
	kasus := []struct {
		jam, menit int
		status     domain.AttendanceStatus
	}{
		{15, 30, domain.PulangCepat},
		{15, 59, domain.PulangCepat},
		{16, 0, domain.TepatWaktu},
		{16, 30, domain.TepatWaktu},
		{17, 0, domain.TepatWaktu},
		{17, 1, domain.LebihKerja},
	}
	for _, k := range kasus {
		h := domain.EvaluateCheckOut(j, waktuDemi(k.jam, k.menit))
		if h.Status != k.status {
			t.Errorf("CheckOut %02d:%02d: dapat %s, ingin %s", k.jam, k.menit, h.Status, k.status)
		}
	}
}

func TestIsWorkDay(t *testing.T) {
	j := jadwalDemo()
	senin := waktuDemi(8, 0) // Selasa 2026-09-10? cek
	if senin.Weekday() == time.Tuesday {
		t.Log("waktuDemi jatuh hari", senin.Weekday())
	}
	minggu := time.Date(2026, 9, 13, 8, 0, 0, 0, domain.WITA) // Minggu
	if j.IsWorkDay(senin) != true {
		t.Error("hari kerja (Sen–Sab) seharusnya true")
	}
	if j.IsWorkDay(minggu) != false {
		t.Error("Minggu seharusnya bukan hari kerja")
	}
}

func TestEvaluateGeofence(t *testing.T) {
	kantor := domain.OfficeLocation{
		ID: "ofc-1", Name: "Kantor Desa Anabanua",
		Point: domain.GeoPoint{Latitude: -4.4680072, Longitude: 119.713862}, RadiusMeters: 100,
	}
	dalam := domain.EvaluateGeofence(kantor.Point, 10, kantor, 50)
	if dalam.Verdict != domain.Inside {
		t.Errorf("titik kantor seharusnya INSIDE, dapat %s", dalam.Verdict)
	}
	jauh := domain.GeoPoint{Latitude: -4.47050, Longitude: 119.713862} // ±278 m
	diLuar := domain.EvaluateGeofence(jauh, 10, kantor, 50)
	if diLuar.Verdict != domain.Outside {
		t.Errorf("titik jauh seharusnya OUTSIDE, dapat %s (%.0f m)", diLuar.Verdict, diLuar.DistanceMeters)
	}
	tidakAkurat := domain.EvaluateGeofence(kantor.Point, 200, kantor, 50)
	if tidakAkurat.Verdict != domain.Inaccurate {
		t.Error("akurasi buruk seharusnya INACCURATE")
	}
}

func TestKewenangan(t *testing.T) {
	if !domain.BolehTetapkanRole(domain.SekretarisDesa, domain.PerangkatDesa) {
		t.Error("sekretaris boleh membuat perangkat desa")
	}
	if domain.BolehTetapkanRole(domain.SekretarisDesa, domain.KepalaDesa) {
		t.Error("tidak boleh membuat kepala desa dari aplikasi")
	}
	if domain.BolehTetapkanRole(domain.PerangkatDesa, domain.PerangkatDesa) {
		t.Error("perangkat desa tidak boleh membuat akun")
	}
	if domain.BolehKelolaAkun(domain.SekretarisDesa, domain.KepalaDesa) || domain.BolehKelolaAkun(domain.KepalaDesa, domain.SekretarisDesa) {
		t.Error("akun administratif tidak saling dikelola")
	}
	if !domain.BolehKelolaAkun(domain.KepalaDesa, domain.PerangkatDesa) {
		t.Error("kepala desa mengelola akun perangkat desa")
	}
	if !domain.BolehKelolaJadwal(domain.SekretarisDesa) || !domain.BolehKelolaJadwal(domain.KepalaDesa) || domain.BolehKelolaJadwal(domain.PerangkatDesa) {
		t.Error("kewenangan jam kerja salah")
	}
}

func TestUndanganSah(t *testing.T) {
	now := time.Now().UTC()
	buat := func(kedaluwarsa time.Time, dipakai *string) domain.Undangan {
		return domain.Undangan{
			Kode: "ANB-TEST-0001", UserID: "u-1", Nama: "X", Email: "x@anabanua.id",
			DibuatPada: domain.WaktuISO(now), KedaluwarsaPada: domain.WaktuISO(kedaluwarsa), DipakaiPada: dipakai,
		}
	}
	sah := domain.TerbitkanUndangan(&domain.User{ID: "u-1", FullName: "A", Email: "a@x.id"}, now)
	if !domain.UndanganSah(sah, now) {
		t.Error("undangan baru harus sah")
	}
	if !strings.HasPrefix(sah.Kode, "ANB-") {
		t.Errorf("kode undangan harus berawalan ANB-, dapat %q", sah.Kode)
	}
	if len(sah.Kode) != len("ANB-XXXX-XXXX") {
		t.Errorf("panjang kode undangan salah: %q", sah.Kode)
	}

	// Regresi: kedua kelompok kode harus berasal dari byte acak yang berbeda.
	// Versi lama membaca b[0..3] untuk kedua kelompok sehingga kode selalu
	// kembar (mis. "ANB-V326-V326") dan entropinya tinggal separuh.
	beda, unik := 0, map[string]bool{}
	for i := 0; i < 50; i++ {
		k := domain.KodeUndangan()
		b := strings.Split(k, "-")
		if len(b) != 3 || len(b[1]) != 4 || len(b[2]) != 4 {
			t.Fatalf("format kode salah: %q", k)
		}
		if b[1] != b[2] {
			beda++
		}
		unik[k] = true
	}
	if beda < 45 {
		t.Errorf("hanya %d dari 50 kode yang kelompoknya berbeda — generator kembar?", beda)
	}
	if len(unik) != 50 {
		t.Errorf("kode undangan tidak unik: %d dari 50", len(unik))
	}

	dipakai := domain.WaktuISO(now)
	if domain.UndanganSah(buat(now.Add(24*time.Hour), &dipakai), now) {
		t.Error("undangan terpakai harus tidak sah")
	}
	if domain.UndanganSah(buat(now.Add(-time.Second), nil), now) {
		t.Error("undangan kedaluwarsa harus tidak sah")
	}
	if domain.PesanKodeTidakSah(buat(now.Add(24*time.Hour), &dipakai), now) == "" {
		t.Error("pesan alasan tidak boleh kosong bila tidak sah")
	}
}

func TestMenitOf(t *testing.T) {
	if domain.MenitOf("08:00") != 480 {
		t.Error("domain.MenitOf 08:00 harus 480")
	}
	if domain.MenitOf("25:00") != 25*60 {
		t.Error("domain.MenitOf tidak memvalidasi jam — beri tahu pemanggil lewat formatJamSah")
	}
}

func TestWITATanggalISO(t *testing.T) {
	// 13 Sep 2026 17:30 domain.WITA masih 13 Sep; di UTC sudah 09:30 masih 13.
	tw := time.Date(2026, 9, 13, 17, 30, 0, 0, domain.WITA)
	if domain.TanggalISO(tw) != "2026-09-13" {
		t.Errorf("domain.TanggalISO domain.WITA salah: %s", domain.TanggalISO(tw))
	}
	// 14 Sep 2026 00:30 domain.WITA masih 14 Sep; di UTC 16:30 = 13 Sep.
	dini := time.Date(2026, 9, 13, 16, 30, 0, 0, time.UTC)
	if domain.TanggalISO(dini) != "2026-09-14" {
		t.Errorf("domain.TanggalISO harus mengikuti domain.WITA: %s", domain.TanggalISO(dini))
	}
}
