package httpapi

import (
	"net/http"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Autentikasi: masuk, keluar, dan data sesi aktif
// ---------------------------------------------------------------------

func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var cmd struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	// Pembatas laju per IP dan IP+email — jangan izinkan uji kredensial massal. IP-nya
	// diambil dari koneksi langsung kecuali bila request melewati proxy yang
	// terdaftar di TRUSTED_PROXIES (lihat response.IPKlien).
	ip := response.IPKlien(r, s.CFG.TrustedProxies)
	kunciIP := "ip:" + ip
	kunciAkun := "akun:" + ip + "|" + strings.ToLower(strings.TrimSpace(cmd.Email))
	ambangIP := s.CFG.LoginRateIPMax
	if ambangIP < s.CFG.LoginRateMax {
		ambangIP = s.CFG.LoginRateMax
	}
	lolosIP := s.Rate.BolehDenganBatas(kunciIP, ambangIP)
	lolosAkun := s.Rate.Boleh(kunciAkun)
	if !lolosIP || !lolosAkun {
		w.Header().Set("Retry-After", itoa(max(s.Rate.Sisa(kunciIP), s.Rate.Sisa(kunciAkun))))
		response.Galat(w, http.StatusTooManyRequests,
			"Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.")
		return
	}
	hasil, err := s.Auth.Masuk(r.Context(), cmd.Email, cmd.Password)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	s.kirimSesi(w, hasil.Token, hasil.Pengguna)
}

func (s *Server) HandleLogout(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	if a != nil {
		if err := s.Auth.Keluar(r.Context(), a.JTI, a.Kedaluwarsa); err != nil {
			response.TulisGalat(w, err)
			return
		}
	}
	hapusCookieSesi(w, s.CFG.CookieSecure)
	w.WriteHeader(http.StatusNoContent)
}

// HandleSaya: GET /auth/saya — tanpa token sah → 401 (frontend menangani).
func (s *Server) HandleSaya(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	u, err := s.Auth.Saya(r.Context(), a.UserID)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, u)
}

// ---------------------------------------------------------------------
// Undangan & aktivasi akun (kode sekali pakai dari sekretaris desa)
// ---------------------------------------------------------------------

func (s *Server) HandleUndangan(w http.ResponseWriter, r *http.Request) {
	u, err := s.Auth.RincianUndangan(r.Context(), r.PathValue("kode"))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	if u == nil {
		response.JSON(w, http.StatusOK, nil)
		return
	}
	response.JSON(w, http.StatusOK, u)
}

func (s *Server) HandleAktivasi(w http.ResponseWriter, r *http.Request) {
	var cmd usecase.AktivasiCmd
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	hasil, err := s.Auth.Aktivasi(r.Context(), r.PathValue("kode"), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	s.kirimSesi(w, hasil.Token, hasil.Pengguna)
}

func (s *Server) kirimSesi(w http.ResponseWriter, token string, pengguna any) {
	http.SetCookie(w, &http.Cookie{
		Name: "presensi_sesi", Value: token, Path: "/api", HttpOnly: true,
		Secure: s.CFG.CookieSecure, SameSite: sameSiteSesi(s.CFG.CookieSecure),
		MaxAge: int(s.CFG.JWTTL.Seconds()),
	})
	isi := map[string]any{"pengguna": pengguna}
	// Mempertahankan respons dev untuk klien non-browser lama; pada produksi
	// token hanya dikirim lewat cookie HttpOnly.
	if !strings.EqualFold(s.CFG.AppEnv, "production") {
		isi["token"] = token
	}
	response.JSON(w, http.StatusOK, isi)
}

func hapusCookieSesi(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: "presensi_sesi", Value: "", Path: "/api", HttpOnly: true,
		Secure: secure, SameSite: sameSiteSesi(secure), MaxAge: -1, Expires: time.Unix(1, 0)})
}

func sameSiteSesi(secure bool) http.SameSite {
	if secure {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}
