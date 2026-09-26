// Titik masuk backend: env → MySQL → repositori → usecase → HTTP.
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"presensi-anabanua/backend/internal/config"
	"presensi-anabanua/backend/internal/delivery/httpapi"
	"presensi-anabanua/backend/internal/disiplinsvc"
	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/facesvc"
	"presensi-anabanua/backend/internal/kalendersvc"
	"presensi-anabanua/backend/internal/port"
	mysqlrepo "presensi-anabanua/backend/internal/repository/mysql"
	"presensi-anabanua/backend/internal/security"
	"presensi-anabanua/backend/internal/seed"
	"presensi-anabanua/backend/internal/usecase"
)

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)

	cfg, err := config.Muat()
	if err != nil {
		log.Fatalf("konfigurasi: %v", err)
	}

	db, err := mysqlrepo.Buka(config.DSN(cfg))
	if err != nil {
		log.Fatalf("mysql: %v", err)
	}
	defer db.Close()

	ctx, batalkan := context.WithTimeout(context.Background(), 30*time.Second)
	defer batalkan()
	if err := mysqlrepo.Migrasi(ctx, db, "migrations"); err != nil {
		log.Fatalf("migrasi: %v", err)
	}
	if err := mysqlrepo.PastikanKantor(ctx, db, cfg.KantorNama, "ofc-1",
		cfg.KantorLat, cfg.KantorLng, cfg.KantorRadiusM); err != nil {
		log.Fatalf("semai kantor: %v", err)
	}

	// Akun administratif (sekretaris & kepala desa) — kredensial dari env;
	// akun yang sudah ada tidak disentuh.
	repoPengguna := mysqlrepo.UserRepoBaru(db)
	seed.Jalankan(ctx, repoPengguna, cfg.BcryptCost, []seed.AkunAdmin{
		{
			Email: cfg.SeedSekretarisEmail, Nama: cfg.SeedSekretarisNama,
			NIP: cfg.SeedSekretarisNIP, Sandi: cfg.SeedSekretarisSandi,
			Peran: domain.SekretarisDesa, Jabatan: "Sekretaris Desa", Unit: "Sekretariat Desa",
		},
		{
			Email: cfg.SeedKepalaEmail, Nama: cfg.SeedKepalaNama,
			NIP: cfg.SeedKepalaNIP, Sandi: cfg.SeedKepalaSandi,
			Peran: domain.KepalaDesa, Jabatan: "Kepala Desa", Unit: "Pemerintah Desa",
		},
	})

	// Kalender hari libur: semai daftar resmi (SKB) untuk tahun yang belum punya
	// catatan sama sekali — suntingan pengelola akun tidak pernah ditimpa.
	repoLibur := mysqlrepo.LiburRepoBaru(db)
	tahunSemai, err := seed.PastikanHariLibur(ctx, repoLibur, time.Now())
	if err != nil {
		log.Printf("PERINGATAN: penyemaian kalender hari libur gagal: %v", err)
	}
	for _, th := range tahunSemai {
		log.Printf("kalender hari libur %d disemai dari daftar resmi (SKB)", th)
	}

	// Layanan AI bila diset; bila tidak, backend berjalan pada mode demo
	// (skor dari klien dipakai) dan enrollment menolak dengan pesan jelas.
	var wajah port.FaceService
	aiAktif := cfg.AIaktif()
	if aiAktif {
		wajah = facesvc.KlienBaru(cfg.AIBaseURL, cfg.AIAPIKey, cfg.AITimeout)
		log.Printf("layanan AI aktif: %s", cfg.AIBaseURL)
	} else {
		log.Printf("PERINGATAN: layanan AI tidak diset — verifikasi wajah memakai skor klien (mode demo).")
	}

	// Sumber resmi kalender hari libur: dipakai tombol "Tarik kalender resmi" di
	// halaman Hari Libur. Tanpa jaringan atau tanpa URL, desa tetap dapat
	// menambah hari libur sendiri secara manual.
	var sumberKalender usecase.SumberKalender
	if k := kalendersvc.KlienBaru(cfg.LiburAPIURL, 8*time.Second); k.Siap() {
		sumberKalender = k
		log.Printf("sumber kalender hari libur: %s", cfg.LiburAPIURL)
	} else {
		log.Printf("PERINGATAN: LIBUR_API_URL kosong — penarikan kalender resmi dimatikan.")
	}

	// Repositori
	users := mysqlrepo.UserRepoBaru(db)
	undangan := mysqlrepo.UndanganRepoBaru(db)
	aktivasi := mysqlrepo.AktivasiRepoBaru(db)
	presensi := mysqlrepo.PresensiRepoBaru(db)
	enroll := mysqlrepo.EnrollRepoBaru(db)
	pengajuan := mysqlrepo.PengajuanRepoBaru(db)
	audit := mysqlrepo.AuditRepoBaru(db)
	konfig := mysqlrepo.KonfigRepoBaru(db)
	jadwalKhusus := mysqlrepo.JadwalKhususRepoBaru(db)

	tokenRepo := mysqlrepo.TokenRepoBaru(db)

	// Keamanan
	token := security.TokenBaru(cfg.JWTSecret, cfg.JWTTL)
	rate := security.RateLimiterBaru(cfg.LoginRateMax, cfg.LoginRateWindow)

	// Webhook kedisiplinan: kosongkan DISIPLIN_WEBHOOK_URL untuk mematikan.
	// Kanal luar yang sedang mati tidak pernah mengganggu presensi.
	var pengirimDisiplin port.PengirimDisiplin
	if k := disiplinsvc.KlienBaru(cfg.DisiplinWebhookURL, cfg.DisiplinWebhookToken, cfg.DisiplinWebhookTimeout); k.Siap() {
		pengirimDisiplin = k
		log.Printf("webhook kedisiplinan aktif (kabar presensi & ringkasan harian).")
	} else {
		log.Printf("PERINGATAN: DISIPLIN_WEBHOOK_URL kosong — kabar kedisiplinan ke kanal luar dimatikan.")
	}

	// Usecase
	ucAuth := usecase.AuthBaru(users, undangan, aktivasi, tokenRepo, token, audit, cfg.BcryptCost)
	ucDisiplin := usecase.DisiplinBaru(presensi, pengajuan, users, konfig, repoLibur, pengirimDisiplin, audit)
	ucPresensi := usecase.PresensiBaru(presensi, konfig, wajah, enroll, users, pengajuan, repoLibur, jadwalKhusus,
		ucDisiplin, aiAktif, cfg.AmbangWajah, cfg.AmbangLiveness)
	ucEnroll := usecase.EnrollBaru(enroll, wajah, users, audit, aiAktif)
	ucPengajuan := usecase.PengajuanBaru(pengajuan, users, audit)
	ucPengguna := usecase.PenggunaBaru(users, undangan, audit)
	ucKonfigurasi := usecase.KonfigurasiBaru(konfig, audit, jadwalKhusus)
	ucLaporan := usecase.LaporanBaru(presensi, pengajuan, users, konfig, repoLibur)
	ucLibur := usecase.LiburBaru(repoLibur, audit, sumberKalender)
	ucAudit := usecase.AuditBaru(audit)
	ucProfil := usecase.ProfilBaru(users, audit, cfg.BcryptCost)

	srv := &httpapi.Server{
		CFG: cfg, HealthCheck: db.PingContext, Auth: ucAuth, Presensi: ucPresensi, Enroll: ucEnroll,
		Pengajuan: ucPengajuan, Pengguna: ucPengguna, Konfigurasi: ucKonfigurasi,
		Laporan: ucLaporan, Libur: ucLibur, Audit: ucAudit, Profil: ucProfil,
		Disiplin: ucDisiplin,
		Token:    token, TokenRepo: tokenRepo, Rate: rate,
	}

	// Bersihkan sesi kedaluwarsa & kunci pembatas laju yang sudah usang secara
	// berkala — tanpa penyapuan ini peta percobaan tumbuh terus oleh setiap
	// alamat yang pernah gagal masuk.
	go func() {
		for range time.Tick(1 * time.Hour) {
			_ = tokenRepo.Bersihkan(context.Background())
			rate.Bersihkan()
		}
	}()

	addr := ":" + cfg.Port
	log.Printf("API berjalan di %s", addr)
	if err := (&http.Server{
		Addr:              addr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}).ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
