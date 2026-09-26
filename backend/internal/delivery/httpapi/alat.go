package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/domain"
)

// Alat bantu bersama seluruh handler.

// pengguna: pengguna lengkap dari sesi (dipakai usecase untuk audit).
func pengguna(a *middleware.Aktor) *domain.User { return a.User }

// RuteJSON: menjaga agar SELURUH balasan di bawah /api/ berbentuk JSON —
// termasuk 404 dan 405 yang biasanya ditulis ServeMux sebagai teks polos
// ("404 page not found"). Tanpa ini salah ketik jalur API sampai ke frontend
// sebagai kegagalan yang tidak dapat dijelaskan (klien gagal mengurai `pesan`),
// padahal penyebabnya sekadar salah rute.
//
// ServeMux.Handler mengembalikan pola yang cocok untuk permintaan; pola kosong
// berarti tidak ada rute yang melayaninya. Dalam hal itu diperiksa apakah jalur
// yang sama punya pola dengan metode lain: bila ada → 405 (+ header Allow),
// bila tidak ada → 404. Keduanya JSON.
func RuteJSON(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pola := mux.Handler(r); pola != "" {
			mux.ServeHTTP(w, r)
			return
		}
		if boleh := metodeYangDilayani(mux, r); len(boleh) > 0 {
			daftar := strings.Join(boleh, ", ")
			w.Header().Set("Allow", daftar)
			response.Galat(w, http.StatusMethodNotAllowed,
				"Metode "+r.Method+" tidak dipakai endpoint ini. Gunakan: "+daftar+".")
			return
		}
		response.Galat(w, http.StatusNotFound, "Endpoint tidak dikenal.")
	})
}

// metodeYangDilayani: metode yang punya pola terdaftar untuk jalur permintaan.
func metodeYangDilayani(mux *http.ServeMux, r *http.Request) []string {
	var boleh []string
	for _, m := range []string{
		http.MethodGet, http.MethodPost, http.MethodPut,
		http.MethodPatch, http.MethodDelete,
	} {
		uji := r.Clone(r.Context())
		uji.Method = m
		if _, pola := mux.Handler(uji); pola != "" {
			boleh = append(boleh, m)
		}
	}
	return boleh
}

// userIDDiminta: pengguna biasa hanya boleh membaca datanya sendiri.
func (s *Server) userIDDiminta(a *middleware.Aktor, diminta string) string {
	if diminta == "" || (diminta != a.UserID && !domain.PengelolaAkun(a.Role)) {
		return a.UserID
	}
	return diminta
}

func stSah(st domain.AttendanceStatus) bool {
	switch st {
	case domain.TepatWaktu, domain.Terlambat, domain.PulangCepat, domain.LebihKerja:
		return true
	}
	return false
}

func statusSah(st domain.RequestStatus) bool {
	switch st {
	case domain.ReqMenunggu, domain.ReqDisetujui, domain.ReqDitolak, domain.ReqDibatal:
		return true
	}
	return false
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
