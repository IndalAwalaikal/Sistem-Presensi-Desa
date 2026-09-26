package middleware

import (
	"log"
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/response"
)

// Pulihkan: panic di handler tidak menjatuhkan server — dibalas 500 JSON.
func Pulihkan(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if p := recover(); p != nil {
				log.Printf("[panic] %v", p)
				response.Galat(w, http.StatusInternalServerError,
					"Terjadi kesalahan di server. Coba lagi beberapa saat.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// HeaderKeamanan: header dasar untuk seluruh tanggapan.
func HeaderKeamanan(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// CORS: hanya origin yang diizinkan env; tanpa env → blok lintas origin.
func CORS(origins []string) func(http.Handler) http.Handler {
	izinkan := map[string]bool{}
	for _, o := range origins {
		izinkan[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && izinkan[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
