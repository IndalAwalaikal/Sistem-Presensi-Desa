package middleware

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/domain"
)

// PenyediaSesi: sumber kebenaran sesi (token → aktor). Implementasinya ada di
// lapisan httpapi (Server.SesiAktor) supaya middleware tetap bebas dari JWT/DB.
type PenyediaSesi interface {
	SesiAktor(ctx context.Context, token string) (*Aktor, error)
}

// TokenDari: token Bearer dari header Authorization ("" bila tidak ada).
func TokenDari(r *http.Request, izinkanBearer bool) string {
	if cookie, err := r.Cookie("presensi_sesi"); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	if !izinkanBearer {
		return ""
	}
	tajuk := r.Header.Get("Authorization")
	token := strings.TrimPrefix(tajuk, "Bearer ")
	if token == "" || token == tajuk {
		return ""
	}
	return token
}

func OriginDiizinkan(r *http.Request, origins []string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	for _, allowed := range origins {
		if origin == allowed {
			return true
		}
	}
	// Deploy same-origin dapat membiarkan CORS_ORIGINS kosong. Dalam hal itu,
	// hanya izinkan Origin yang host-nya sama dengan halaman perujuk dan API.
	perujuk, err := url.Parse(r.Header.Get("Referer"))
	if err == nil && perujuk.Host != "" && perujuk.Host == r.Host {
		asal, err := url.Parse(origin)
		return err == nil && asal.Host == r.Host && asal.Scheme == perujuk.Scheme
	}
	return false
}

// Autentikasi: wajib token sah & tidak dicabut; aktor ditaruh di konteks.
func Autentikasi(p PenyediaSesi, origins []string, izinkanBearer bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				if _, err := r.Cookie("presensi_sesi"); err == nil && !OriginDiizinkan(r, origins) {
					response.Galat(w, http.StatusForbidden, "Asal permintaan tidak diizinkan.")
					return
				}
			}
			token := TokenDari(r, izinkanBearer)
			if token == "" {
				response.TulisGalat(w, domain.ErrSesiKadaluwarsa)
				return
			}
			a, err := p.SesiAktor(r.Context(), token)
			if err != nil {
				response.TulisGalat(w, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(DenganAktor(r.Context(), a)))
		})
	}
}

// WajibAdmin: hanya sekretaris desa & kepala desa (dipakai di dalam rute
// yang sudah melewati Autentikasi).
func WajibAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a := AktorDari(r.Context())
		if a == nil || !domain.PengelolaAkun(a.Role) {
			response.Galat(w, http.StatusForbidden,
				"Hanya sekretaris desa dan kepala desa yang berwenang.")
			return
		}
		next.ServeHTTP(w, r)
	})
}
