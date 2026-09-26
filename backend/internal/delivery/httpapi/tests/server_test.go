package tests

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"presensi-anabanua/backend/internal/config"
	"presensi-anabanua/backend/internal/delivery/httpapi"
	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/security"
	"presensi-anabanua/backend/internal/usecase"
)

func serverUji(t *testing.T) *httpapi.Server {
	t.Helper()
	s, _ := serverUjiLengkap(t)
	return s
}

// serverUjiLengkap: server uji beserta repositori penggunanya. Uji rekap
// membutuhkan pegangan ke repositori itu untuk menyiapkan tanggal akun dibuat.
func serverUjiLengkap(t *testing.T) (*httpapi.Server, *stubUsers) {
	t.Helper()
	users := &stubUsers{data: map[string]*domain.PenggunaInternal{}, byID: map[string]*domain.PenggunaInternal{}}
	hash, _ := security.HashSandi("rahasia-benar", 10)

	aktif := &domain.PenggunaInternal{User: domain.User{
		ID: "usr-1", FullName: "Ahmad", Email: "ahmad@anabanua.id", Role: domain.PerangkatDesa,
		AccountStatus: domain.Aktif, BiometricStatus: domain.BiometrikAktif,
	}, HashSandi: &hash}
	users.data["ahmad@anabanua.id"] = aktif
	users.byID["usr-1"] = aktif

	sekretaris := &domain.PenggunaInternal{User: domain.User{
		ID: "usr-2", FullName: "Rahmat", Email: "sekretaris@anabanua.id", Role: domain.SekretarisDesa,
		AccountStatus: domain.Aktif, BiometricStatus: domain.BiometrikAktif,
	}, HashSandi: &hash}
	users.data["sekretaris@anabanua.id"] = sekretaris
	users.byID["usr-2"] = sekretaris

	belumAktif := &domain.PenggunaInternal{User: domain.User{
		ID: "usr-3", FullName: "Nurul", Email: "nurul@anabanua.id", Role: domain.PerangkatDesa,
		AccountStatus: domain.StatusUndangan, BiometricStatus: domain.BiometrikBelum,
	}}
	users.data["nurul@anabanua.id"] = belumAktif
	users.byID["usr-3"] = belumAktif

	und := &stubUndangan{data: map[string]*domain.Undangan{}}
	now := time.Now().UTC()
	und.data["ANB-NURL-4821"] = &domain.Undangan{
		Kode: "ANB-NURL-4821", UserID: "usr-3", Nama: "Nurul", Email: "nurul@anabanua.id",
		DibuatPada: domain.WaktuISO(now), KedaluwarsaPada: domain.WaktuISO(now.Add(7 * 24 * time.Hour)),
	}

	cfg := &config.Config{MaxBodyBytes: 8 << 20}
	token := security.TokenBaru(strings.Repeat("k", 40), time.Hour)
	authAudit := &stubAudit{}
	auth := usecase.AuthBaru(users, und, &stubAktivasi{users: users, undangan: und}, &stubToken{dicabut: map[string]bool{}}, token, authAudit, 10)
	penggunaUC := usecase.PenggunaBaru(users, und, &stubAudit{})
	profilUC := usecase.ProfilBaru(users, &stubAudit{}, 10)

	return &httpapi.Server{
		CFG: cfg, Auth: auth, Pengguna: penggunaUC, Profil: profilUC,
		Token: token, TokenRepo: &stubToken{dicabut: map[string]bool{}},
		Rate: security.RateLimiterBaru(100, time.Minute),
	}, users
}

func panggil(t *testing.T, s *httpapi.Server, metode, jalur, token string, isi any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var baca *strings.Reader
	if isi != nil {
		b, _ := json.Marshal(isi)
		baca = strings.NewReader(string(b))
	} else {
		baca = strings.NewReader("")
	}
	req := httptest.NewRequest(metode, jalur, baca)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res := httptest.NewRecorder()
	s.Router().ServeHTTP(res, req)
	body := map[string]any{}
	if res.Body.Len() > 0 {
		_ = json.Unmarshal(res.Body.Bytes(), &body)
	}
	return res, body
}

// masuk: login dan kembalikan token.
func masuk(t *testing.T, s *httpapi.Server, email, sandi string) string {
	t.Helper()
	_, isi := panggil(t, s, "POST", "/api/auth/login", "", map[string]string{
		"email": email, "password": sandi,
	})
	if isi["token"] == nil {
		t.Fatalf("login gagal untuk %s: %v", email, isi)
	}
	return isi["token"].(string)
}
func TestAlurLoginSaya(t *testing.T) {
	s := serverUji(t)

	res, isi := panggil(t, s, "POST", "/api/auth/login", "", map[string]string{
		"email": "ahmad@anabanua.id", "password": "sandi-salah",
	})
	if res.Code != http.StatusUnauthorized || !strings.Contains(isi["pesan"].(string), "salah") {
		t.Fatalf("sandi salah: %d %v", res.Code, isi)
	}

	// Email tak dikenal → PESAN SAMA dengan sandi salah (tanpa bocor).
	_, isi2 := panggil(t, s, "POST", "/api/auth/login", "", map[string]string{
		"email": "takkenal@anabanua.id", "password": "sandi-salah",
	})
	if isi2["pesan"] != isi["pesan"] {
		t.Fatalf("pesan harus identik: %q vs %q", isi2["pesan"], isi["pesan"])
	}

	res3, isi3 := panggil(t, s, "POST", "/api/auth/login", "", map[string]string{
		"email": "ahmad@anabanua.id", "password": "rahasia-benar",
	})
	if res3.Code != http.StatusOK || isi3["token"] == "" {
		t.Fatalf("login sukses: %d %v", res3.Code, isi3)
	}
	tok := isi3["token"].(string)

	res4, _ := panggil(t, s, "GET", "/api/auth/saya", "", nil)
	if res4.Code != http.StatusUnauthorized {
		t.Fatalf("tanpa token: %d", res4.Code)
	}

	res5, isi5 := panggil(t, s, "GET", "/api/auth/saya", tok, nil)
	if res5.Code != http.StatusOK || isi5["email"] != "ahmad@anabanua.id" {
		t.Fatalf("auth/saya: %d %v", res5.Code, isi5)
	}
	if _, bocor := isi5["hashSandi"]; bocor {
		t.Fatal("hash sandi tidak boleh keluar dari backend")
	}
}

func TestAlurAktivasiKodeUndangan(t *testing.T) {
	s := serverUji(t)

	res, isi := panggil(t, s, "GET", "/api/aktivasi/ANB-NURL-4821", "", nil)
	if res.Code != http.StatusOK || isi["email"] != "nurul@anabanua.id" {
		t.Fatalf("rincian undangan: %d %v", res.Code, isi)
	}

	res2, isi2 := panggil(t, s, "POST", "/api/aktivasi/anb-nurl-4821", "", map[string]any{
		"password": "sandi-baru-123", "phoneNumber": "0852-111", "address": "Desa",
		"consentBiometrik": false,
	})
	if res2.Code != http.StatusBadRequest || !strings.Contains(strings.ToLower(isi2["pesan"].(string)), "persetujuan") {
		t.Fatalf("aktivasi tanpa persetujuan: %d %v", res2.Code, isi2)
	}

	res3, isi3 := panggil(t, s, "POST", "/api/aktivasi/anb-nurl-4821", "", map[string]any{
		"password": "sandi-baru-123", "phoneNumber": "0852-111", "address": "Desa",
		"consentBiometrik": true,
	})
	if res3.Code != http.StatusOK || isi3["token"] == "" {
		t.Fatalf("aktivasi: %d %v", res3.Code, isi3)
	}
	pengguna := isi3["pengguna"].(map[string]any)
	if pengguna["accountStatus"] != "AKTIF" {
		t.Fatalf("status setelah aktivasi harus AKTIF: %v", pengguna["accountStatus"])
	}

	res4, _ := panggil(t, s, "POST", "/api/aktivasi/anb-nurl-4821", "", map[string]any{
		"password": "sandi-baru-123", "phoneNumber": "0852-111", "address": "Desa",
		"consentBiometrik": true,
	})
	if res4.Code != http.StatusBadRequest && res4.Code != http.StatusConflict {
		t.Fatalf("kode terpakai harus ditolak: %d", res4.Code)
	}
}

func TestAlurRateLimitLogin(t *testing.T) {
	s := serverUji(t)
	s.Rate = security.RateLimiterBaru(2, time.Minute)
	isi := map[string]string{"email": "ahmad@anabanua.id", "password": "salah"}
	panggil(t, s, "POST", "/api/auth/login", "", isi)
	panggil(t, s, "POST", "/api/auth/login", "", isi)
	res, _ := panggil(t, s, "POST", "/api/auth/login", "", isi)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("login ke-3 harus 429, dapat %d", res.Code)
	}
}

func TestHealthCheckMelaporkanDatabaseTidakSiap(t *testing.T) {
	s := serverUji(t)
	s.HealthCheck = func(context.Context) error { return errors.New("database tidak tersedia") }
	res, body := panggil(t, s, "GET", "/api/kesehatan", "", nil)
	if res.Code != http.StatusServiceUnavailable || body["status"] != "tidak siap" {
		t.Fatalf("dependensi gagal harus menghasilkan 503, dapat %d %v", res.Code, body)
	}
}

func TestKewenanganAdmin(t *testing.T) {
	s := serverUji(t)
	tokSekre := masuk(t, s, "sekretaris@anabanua.id", "rahasia-benar")
	tokPerangkat := masuk(t, s, "ahmad@anabanua.id", "rahasia-benar")

	// Endpoint admin dengan token perangkat desa → 403 (middleware).
	res, _ := panggil(t, s, "GET", "/api/admin/pengguna", tokPerangkat, nil)
	if res.Code != http.StatusForbidden {
		t.Fatalf("endpoint admin harus 403: %d", res.Code)
	}

	// Sekretaris membuat akun perangkat desa → sukses + kode undangan.
	res2, isi2 := panggil(t, s, "POST", "/api/admin/pengguna", tokSekre, map[string]any{
		"fullName": "Siti Baru", "email": "siti@anabanua.id", "role": "PERANGKAT_DESA",
		"employeeId": "19900101 202001 2 001", "position": "Kaur", "unit": "Sekretariat",
	})
	if res2.Code != http.StatusOK {
		t.Fatalf("buat akun: %d %v", res2.Code, isi2)
	}
	und := isi2["undangan"].(map[string]any)
	if und["kode"] == "" {
		t.Fatal("kode undangan harus diterbitkan")
	}

	// Membuat akun KEPALA_DESA → ditolak (aturan domain, bukan hanya HTTP).
	res3, isi3 := panggil(t, s, "POST", "/api/admin/pengguna", tokSekre, map[string]any{
		"fullName": "X", "email": "x@anabanua.id", "role": "KEPALA_DESA",
		"employeeId": "1", "position": "Kades", "unit": "Desa",
	})
	if res3.Code != http.StatusForbidden {
		t.Fatalf("membuat kepala desa harus 403: %d %v", res3.Code, isi3)
	}
}

// TestAlurProfilSendiri: apa yang boleh dan tidak boleh diubah pemilik akun.
// Identitas kepegawaian (nama, NIP/NIK, jabatan, unit) sengaja tidak punya jalur
// tulis — bukan sekadar tidak ada tombolnya di antarmuka.
func TestAlurProfilSendiri(t *testing.T) {
	s := serverUji(t)
	tok := masuk(t, s, "ahmad@anabanua.id", "rahasia-benar")

	// Kontak milik sendiri boleh diperbarui.
	res, isi := panggil(t, s, "POST", "/api/profil", tok, map[string]any{
		"phoneNumber": "0852-4000-5001", "address": "Dusun Anabanua, Kec. Barru",
	})
	if res.Code != http.StatusOK {
		t.Fatalf("ubah kontak: %d %v", res.Code, isi)
	}
	if of := isi["official"].(map[string]any); of["phoneNumber"] != "0852-4000-5001" {
		t.Fatalf("kontak tidak tersimpan pada balasan: %v", of)
	}

	// ... dan benar-benar tersimpan di sumber data.
	_, saya := panggil(t, s, "GET", "/api/auth/saya", tok, nil)
	of := saya["official"].(map[string]any)
	if of["phoneNumber"] != "0852-4000-5001" || of["address"] != "Dusun Anabanua, Kec. Barru" {
		t.Fatalf("kontak tidak tersimpan: %v", of)
	}

	// Nomor telepon yang tidak masuk akal ditolak, data lama tidak ikut rusak.
	res, isi = panggil(t, s, "POST", "/api/profil", tok, map[string]any{
		"phoneNumber": "12", "address": "Dusun Anabanua, Kec. Barru",
	})
	if res.Code != http.StatusBadRequest {
		t.Fatalf("telepon ngawur harus 400: %d %v", res.Code, isi)
	}

	// Field identitas kepegawaian tidak dikenal endpoint ini → ditolak mentah,
	// sehingga tidak ada cara menyelundupkan nama/NIP lewat badan permintaan.
	res, _ = panggil(t, s, "POST", "/api/profil", tok, map[string]any{
		"phoneNumber": "0852-4000-5001", "address": "Dusun Anabanua, Kec. Barru",
		"fullName": "Nama Karangan Sendiri",
	})
	if res.Code != http.StatusBadRequest {
		t.Fatalf("field identitas harus ditolak: %d", res.Code)
	}
	_, saya = panggil(t, s, "GET", "/api/auth/saya", tok, nil)
	if saya["fullName"] != "Ahmad" {
		t.Fatalf("nama tidak boleh berubah: %v", saya["fullName"])
	}

	// Ganti kata sandi: sandi lama adalah buktinya.
	res, isi = panggil(t, s, "POST", "/api/profil/sandi", tok, map[string]any{
		"sandiLama": "salah-sekali", "sandiBaru": "sandi-baru-123",
	})
	if res.Code != http.StatusBadRequest {
		t.Fatalf("sandi lama salah harus 400: %d %v", res.Code, isi)
	}

	res, isi = panggil(t, s, "POST", "/api/profil/sandi", tok, map[string]any{
		"sandiLama": "rahasia-benar", "sandiBaru": "rahasia-benar",
	})
	if res.Code != http.StatusBadRequest {
		t.Fatalf("sandi baru sama dengan lama harus 400: %d %v", res.Code, isi)
	}

	res, isi = panggil(t, s, "POST", "/api/profil/sandi", tok, map[string]any{
		"sandiLama": "rahasia-benar", "sandiBaru": "rahasia-baru-123",
	})
	if res.Code != http.StatusNoContent {
		t.Fatalf("ganti sandi: %d %v", res.Code, isi)
	}

	// Sandi lama tidak berlaku lagi; yang baru berlaku.
	res, _ = panggil(t, s, "POST", "/api/auth/login", "", map[string]string{
		"email": "ahmad@anabanua.id", "password": "rahasia-benar",
	})
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("sandi lama harus mati: %d", res.Code)
	}
	masuk(t, s, "ahmad@anabanua.id", "rahasia-baru-123")
}

// TestRuteApiTakDikenalTetapJSON: /api/ yang salah ketik atau salah metode harus
// tetap berbentuk {"pesan": ...} — bukan "404 page not found" teks polos, supaya
// klien dapat menampilkan penyebabnya.
func TestRuteApiTakDikenalTetapJSON(t *testing.T) {
	s := serverUji(t)
	tok := masuk(t, s, "ahmad@anabanua.id", "rahasia-benar")

	res, isi := panggil(t, s, "GET", "/api/tidak-ada", tok, nil)
	if res.Code != http.StatusNotFound || isi["pesan"] == nil {
		t.Fatalf("404 /api/ harus JSON: %d %v", res.Code, isi)
	}

	// Metode salah pada jalur yang ada: 405 + header Allow, juga JSON.
	req := httptest.NewRequest("PUT", "/api/profil", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("PUT /api/profil harus 405: %d", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); !strings.Contains(allow, "POST") {
		t.Fatalf("header Allow harus memuat POST: %q", allow)
	}
	var badan map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &badan); err != nil || badan["pesan"] == nil {
		t.Fatalf("405 /api/ harus JSON: %s", rec.Body.String())
	}
}

// panggilDaftar: seperti `panggil`, tetapi untuk balasan berbentuk JSON array
// (rekap bulanan) yang tidak dapat dibaca sebagai peta.
func panggilDaftar(t *testing.T, s *httpapi.Server, jalur, token string) (int, []map[string]any) {
	t.Helper()
	req := httptest.NewRequest("GET", jalur, strings.NewReader(""))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	s.Router().ServeHTTP(res, req)
	var isi []map[string]any
	if res.Body.Len() > 0 {
		if err := json.Unmarshal(res.Body.Bytes(), &isi); err != nil {
			t.Fatalf("balasan bukan daftar JSON: %s", res.Body.String())
		}
	}
	return res.Code, isi
}

func barisRekap(t *testing.T, isi []map[string]any, userId string) map[string]any {
	t.Helper()
	for _, b := range isi {
		if b["userId"] == userId {
			return b
		}
	}
	t.Fatalf("baris rekap untuk %s tidak ada: %v", userId, isi)
	return nil
}

func angka(t *testing.T, baris map[string]any, kolom string) int {
	t.Helper()
	nilai, ok := baris[kolom].(float64)
	if !ok {
		t.Fatalf("kolom %q bukan angka: %v", kolom, baris[kolom])
	}
	return int(nilai)
}

// TestRekapBulananMenghitungTanpaKeterangan: perangkat yang tidak melakukan
// presensi harus terlihat angkanya — bukan hanya hadir dan terlambat.
//
// Yang diuji adalah keseluruhan jalur HTTP → usecase → domain dengan jam server
// dibekukan (Kamis 10 September 2026, 09.00 WITA — sudah lewat batas masuk 08.00),
// sehingga hasilnya tidak bergantung kapan uji dijalankan.
func TestRekapBulananMenghitungTanpaKeterangan(t *testing.T) {
	s, users := serverUjiLengkap(t)

	// Akun yang sudah ada sejak awal bulan.
	users.byID["usr-1"].DibuatPada = "2026-09-01"
	users.byID["usr-2"].DibuatPada = "2026-09-01"

	// Perangkat baru: akun dibuat 9 September, belum pernah presensi. Hari kerja
	// sebelum akun dibuat tidak boleh dihitung sebagai "tanpa keterangan".
	dewi := &domain.PenggunaInternal{
		User: domain.User{
			ID: "usr-4", FullName: "Dewi", Email: "dewi@anabanua.id",
			Role: domain.PerangkatDesa, AccountStatus: domain.Aktif,
			BiometricStatus: domain.BiometrikAktif,
		},
		DibuatPada: "2026-09-09",
	}
	users.data["dewi@anabanua.id"] = dewi
	users.byID["usr-4"] = dewi

	presensi := &stubPresensi{
		rekap: map[string]domain.RekapBulanan{"usr-1": {Hadir: 2, Terlambat: 1}},
		hadir: map[string]map[string]bool{
			"usr-1": {"2026-09-02": true, "2026-09-03": true},
		},
		// Transaksi apa adanya: yang diuji adalah durasinya ("lambat berapa
		// menit", "pulang cepat berapa menit"), bukan sekadar jumlah kejadian.
		// Waktu disimpan seperti `domain.WaktuISO` (UTC, RFC3339): 08:25 WITA
		// adalah 00:25Z, jadi selisihnya hanya benar bila dikonversi ke WITA.
		transaksi: []domain.Attendance{
			{
				ID: "att-1", UserID: "usr-1", Type: domain.CheckIn, Status: domain.Terlambat,
				SelisihMenit: 25, // dicatat saat batas masuk 08:00
				Verification: domain.VerificationMeta{
					ServerTime: domain.WaktuISO(time.Date(2026, 9, 3, 8, 25, 0, 0, domain.WITA)),
				},
			},
			{
				// Pulang 15:30 WITA — 30 menit lebih awal dari jam pulang 16:00.
				ID: "att-2", UserID: "usr-1", Type: domain.CheckOut, Status: domain.PulangCepat,
				SelisihMenit: -30, // 30 mnt sblm jam pulang 16:00
				Verification: domain.VerificationMeta{
					ServerTime: domain.WaktuISO(time.Date(2026, 9, 3, 15, 30, 0, 0, domain.WITA)),
				},
			},
			{
				// Tepat waktu: tidak menambah durasi apa pun.
				ID: "att-3", UserID: "usr-1", Type: domain.CheckIn, Status: domain.TepatWaktu,
				Verification: domain.VerificationMeta{
					ServerTime: domain.WaktuISO(time.Date(2026, 9, 2, 7, 50, 0, 0, domain.WITA)),
				},
			},
			{
				// Pulang di dalam rentang jam kerja: bukan pulang cepat.
				ID: "att-4", UserID: "usr-1", Type: domain.CheckOut, Status: domain.TepatWaktu,
				Verification: domain.VerificationMeta{
					ServerTime: domain.WaktuISO(time.Date(2026, 9, 2, 16, 20, 0, 0, domain.WITA)),
				},
			},
		},
	}
	pengajuan := &stubPengajuan{
		rentang: []domain.WorkRequest{{
			ID: "req-1", Type: domain.ReqIzin, UserID: "usr-2", UserName: "Rahmat",
			StartDate: "2026-09-04", EndDate: "2026-09-07", Status: domain.ReqDisetujui,
		}},
	}
	konfig := &stubKonfig{aktif: domain.KonfigurasiAktif{Schedule: domain.WorkSchedule{
		ID: "sch-1", CheckInStart: "07:30", CheckInDeadline: "08:00",
		CheckOutStart: "16:00", CheckOutEnd: "17:00",
		WorkDays: []int{1, 2, 3, 4, 5, 6},
	}}}
	jam := func() time.Time { return time.Date(2026, 9, 10, 9, 0, 0, 0, domain.WITA) }
	s.Laporan = usecase.LaporanDenganJam(presensi, pengajuan, users, konfig, &stubLibur{}, jam)

	tokSekre := masuk(t, s, "sekretaris@anabanua.id", "rahasia-benar")
	tokPerangkat := masuk(t, s, "ahmad@anabanua.id", "rahasia-benar")

	// Hanya pengelola akun yang boleh membaca rekap.
	if res, _ := panggil(t, s, "GET", "/api/admin/rekap?tahun=2026&bulan=9", tokPerangkat, nil); res.Code != http.StatusForbidden {
		t.Fatalf("perangkat desa tidak boleh membaca rekap: %d", res.Code)
	}

	kode, baris := panggilDaftar(t, s, "/api/admin/rekap?tahun=2026&bulan=9", tokSekre)
	if kode != http.StatusOK {
		t.Fatalf("rekap: %d %v", kode, baris)
	}
	// Akun yang belum diaktivasi tidak pernah muncul di rekap.
	for _, b := range baris {
		if b["userId"] == "usr-3" {
			t.Fatalf("akun belum aktivasi tidak boleh dihitung: %v", b)
		}
	}

	// Hari kerja tertutup September 2026 sampai 10 Sep pukul 09.00: 1,2,3,4,5
	// (6 = Minggu), 7,8,9,10 = 9 hari.
	// Ahmad presensi masuk 2 & 3 → tanpa keterangan = 9 - 2 = 7 hari.
	ahmad := barisRekap(t, baris, "usr-1")
	if angka(t, ahmad, "hadir") != 2 || angka(t, ahmad, "terlambat") != 1 {
		t.Fatalf("rekap Ahmad: %v", ahmad)
	}
	if angka(t, ahmad, "tanpaKeterangan") != 7 {
		t.Fatalf("Ahmad seharusnya 7 hari tanpa keterangan, dapat %v", ahmad)
	}

	// Durasi, bukan hanya jumlah kejadian: 08:25 WITA = 25 menit setelah batas
	// masuk 08:00; pulang 15:30 = 30 menit lebih awal dari jam pulang 16:00.
	// Transaksi tepat waktu tidak menambah apa pun.
	if menit := angka(t, ahmad, "terlambatMenit"); menit != 25 {
		t.Fatalf("keterlambatan Ahmad seharusnya 25 menit, dapat %d: %v", menit, ahmad)
	}
	if menit := angka(t, ahmad, "pulangCepatMenit"); menit != 30 {
		t.Fatalf("pulang cepat Ahmad seharusnya 30 menit, dapat %d: %v", menit, ahmad)
	}
	// Tanpa transaksi: durasinya nol, bukan kosong/hilang dari balasan.
	// Rahmat tidak presensi 4–7 September, tetapi izinnya disetujui. Yang
	// dilaporkan adalah HARI KERJA yang tercakup — 4, 5, dan 7 (6 = Minggu) →
	// izin 3 hari (bukan 1 berkas pengajuan), tanpa keterangan 9 - 3 = 6 hari.
	rahmat := barisRekap(t, baris, "usr-2")
	if angka(t, rahmat, "izin") != 3 {
		t.Fatalf("izin Rahmat harus 3 hari kerja, dapat %v", rahmat)
	}
	if angka(t, rahmat, "tanpaKeterangan") != 6 {
		t.Fatalf("izin yang disetujui harus mengurangi tanpa keterangan: %v", rahmat)
	}
	if angka(t, rahmat, "terlambatMenit") != 0 || angka(t, rahmat, "pulangCepatMenit") != 0 {
		t.Fatalf("tanpa transaksi durasinya harus 0: %v", rahmat)
	}

	// Pengajuan lintas bulan: cuti 30 Agustus – 2 September hanya menyumbang
	// 1 & 2 September pada rekap September (30–31 Agustus milik Agustus).
	pengajuan.rentang = []domain.WorkRequest{{
		ID: "req-lintas-bulan", Type: domain.ReqCuti, UserID: "usr-2", UserName: "Rahmat",
		StartDate: "2026-08-30", EndDate: "2026-09-02", Status: domain.ReqDisetujui,
	}}
	_, baris = panggilDaftar(t, s, "/api/admin/rekap?tahun=2026&bulan=9", tokSekre)
	if hari := angka(t, barisRekap(t, baris, "usr-2"), "cuti"); hari != 2 {
		t.Fatalf("cuti lintas bulan seharusnya 2 hari di September, dapat %d", hari)
	}

	// Dewi baru dibuat 9 September: hanya 9 & 10 September yang tertutup dan
	// keduanya tanpa presensi → 2 hari. Hari kerja 1–8 September (sebelum akun
	// ada) tidak boleh menambah angkanya.
	dewiRekap := barisRekap(t, baris, "usr-4")
	if angka(t, dewiRekap, "hadir") != 0 || angka(t, dewiRekap, "tanpaKeterangan") != 2 {
		t.Fatalf("perangkat baru seharusnya 2 hari tanpa keterangan: %v", dewiRekap)
	}

	// WFH tidak menutup kewajiban presensi: hari yang dicakup pengajuan WFH tetap
	// dihitung tanpa keterangan, sama dengan aturan ringkasan monitoring harian.
	pengajuan.rentang = []domain.WorkRequest{{
		ID: "req-2", Type: domain.ReqWFH, UserID: "usr-4", UserName: "Dewi",
		StartDate: "2026-09-09", EndDate: "2026-09-09", Status: domain.ReqDisetujui,
	}}
	_, baris = panggilDaftar(t, s, "/api/admin/rekap?tahun=2026&bulan=9", tokSekre)
	if angka(t, barisRekap(t, baris, "usr-4"), "tanpaKeterangan") != 2 {
		t.Fatal("WFH tidak boleh menghapus kewajiban presensi")
	}

	// Bulan yang belum berjalan: tidak ada hari yang tutup buku, jadi tidak ada
	// yang dihitung tanpa keterangan.
	_, bulanDepan := panggilDaftar(t, s, "/api/admin/rekap?tahun=2026&bulan=10", tokSekre)
	if angka(t, barisRekap(t, bulanDepan, "usr-1"), "tanpaKeterangan") != 0 {
		t.Fatal("bulan yang belum berjalan tidak boleh punya hari tanpa keterangan")
	}
}
