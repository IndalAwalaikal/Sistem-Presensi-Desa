package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
)

// Router: peta seluruh rute API — selaras dengan kontrak yang dijanjikan
// frontend. Dikelompokkan: publik, perlu sesi, khusus pengelola akun.
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// ---- Publik -----------------------------------------------------
	mux.HandleFunc("POST /api/auth/login", s.HandleLogin)
	mux.HandleFunc("GET /api/kesehatan", func(w http.ResponseWriter, r *http.Request) {
		if s.HealthCheck != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := s.HealthCheck(ctx); err != nil {
				response.JSON(w, http.StatusServiceUnavailable, map[string]string{"status": "tidak siap"})
				return
			}
		}
		response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/aktivasi/{kode}", s.HandleUndangan)
	mux.HandleFunc("POST /api/aktivasi/{kode}", s.HandleAktivasi)

	// ---- Perlu sesi -------------------------------------------------
	dilindungi := http.NewServeMux()
	dilindungi.HandleFunc("POST /api/auth/logout", s.HandleLogout)
	dilindungi.HandleFunc("GET /api/auth/saya", s.HandleSaya)

	// Data milik pemilik akun sendiri. Identitas kepegawaian (nama, NIP/NIK,
	// jabatan, unit) tidak punya endpoint di sini maupun di grup admin —
	// nilainya ditetapkan pengelola akun saat akun dibuat.
	dilindungi.HandleFunc("POST /api/profil", s.HandleProfilUbahKontak)
	dilindungi.HandleFunc("POST /api/profil/sandi", s.HandleProfilUbahSandi)

	dilindungi.HandleFunc("GET /api/presensi/hari-ini", s.HandleStatusHariIni)
	dilindungi.HandleFunc("GET /api/presensi/saya", s.HandleRiwayat)
	dilindungi.HandleFunc("POST /api/presensi", s.HandleKirimPresensi)
	dilindungi.HandleFunc("GET /api/konfigurasi", s.HandleKonfigurasi)
	dilindungi.HandleFunc("GET /api/libur", s.HandleLiburTahun)

	dilindungi.HandleFunc("GET /api/enrollment/saya", s.HandleEnrollmentSaya)
	dilindungi.HandleFunc("POST /api/enrollment/validasi-foto", s.HandleEnrollmentValidasiFoto)
	dilindungi.HandleFunc("POST /api/enrollment", s.HandleEnrollmentKirim)

	dilindungi.HandleFunc("GET /api/pengajuan/saya", s.HandlePengajuanSaya)
	dilindungi.HandleFunc("POST /api/pengajuan", s.HandlePengajuanKirim)
	dilindungi.HandleFunc("POST /api/pengajuan/{id}/batalkan", s.HandlePengajuanBatal)

	// ---- Khusus sekretaris/kepala desa ------------------------------
	admin := func(h http.HandlerFunc) http.Handler { return middleware.WajibAdmin(h) }

	dilindungi.Handle("GET /api/admin/enrollment/menunggu", admin(s.HandleAdminEnrollmentPending))
	dilindungi.Handle("POST /api/admin/enrollment/{id}/putuskan", admin(s.HandleAdminEnrollmentPutuskan))

	dilindungi.Handle("GET /api/admin/pengguna", admin(s.HandleAdminDaftarPengguna))
	dilindungi.Handle("POST /api/admin/pengguna", admin(s.HandleAdminBuatPengguna))
	dilindungi.Handle("POST /api/admin/pengguna/{id}/status", admin(s.HandleAdminUbahStatus))
	dilindungi.Handle("POST /api/admin/pengguna/{id}/reset-sandi", admin(s.HandleAdminResetSandi))
	dilindungi.Handle("GET /api/admin/undangan", admin(s.HandleAdminDaftarUndangan))

	dilindungi.Handle("GET /api/admin/pengajuan", admin(s.HandleAdminDaftarPengajuan))
	dilindungi.Handle("POST /api/admin/pengajuan/putuskan", admin(s.HandleAdminPutuskanPengajuan))
	dilindungi.Handle("POST /api/admin/pengajuan/massal", admin(s.HandleAdminPengajuanMassal))
	dilindungi.Handle("GET /api/admin/pengajuan/menunggu", admin(s.HandleAdminPengajuanMenunggu))

	dilindungi.Handle("GET /api/admin/presensi", admin(s.HandleAdminPresensi))
	dilindungi.Handle("GET /api/admin/audit", admin(s.HandleAdminAudit))
	dilindungi.Handle("GET /api/admin/rekap", admin(s.HandleAdminRekap))
	dilindungi.Handle("POST /api/admin/jadwal", admin(s.HandleAdminSimpanJadwal))
	dilindungi.Handle("POST /api/admin/kantor", admin(s.HandleAdminSimpanKantor))
	dilindungi.Handle("POST /api/admin/libur", admin(s.HandleAdminSimpanLibur))
	dilindungi.Handle("POST /api/admin/libur/impor", admin(s.HandleAdminImporLibur))
	dilindungi.Handle("POST /api/admin/libur/{tanggal}/hapus", admin(s.HandleAdminHapusLibur))
	dilindungi.Handle("GET /api/admin/jadwal-khusus", admin(s.HandleAdminDaftarJadwalKhusus))
	dilindungi.Handle("POST /api/admin/jadwal-khusus", admin(s.HandleAdminSimpanJadwalKhusus))
	dilindungi.Handle("DELETE /api/admin/jadwal-khusus/{id}", admin(s.HandleAdminHapusJadwalKhusus))

	dilindungi.Handle("GET /api/admin/disiplin/status", admin(s.HandleAdminDisiplinStatus))
	dilindungi.Handle("GET /api/admin/disiplin/ringkasan", admin(s.HandleAdminDisiplinRingkasan))
	dilindungi.Handle("POST /api/admin/disiplin/kirim", admin(s.HandleAdminDisiplinKirim))

	mux.Handle("/api/", middleware.Autentikasi(s, s.CFG.CORSOrigins,
		!strings.EqualFold(s.CFG.AppEnv, "production"))(RuteJSON(dilindungi)))

	// Rute di luar /api/ (mis. halaman web yang tersesat ke port API).
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		response.Galat(w, http.StatusNotFound, "Endpoint tidak dikenal.")
	})

	return middleware.Pulihkan(middleware.HeaderKeamanan(middleware.CORS(s.CFG.CORSOrigins)(mux)))
}
