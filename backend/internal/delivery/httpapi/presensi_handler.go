package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Presensi harian: status, riwayat, kirim; daftar harian untuk pengelola
// ---------------------------------------------------------------------

func (s *Server) HandleStatusHariIni(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	st, err := s.Presensi.StatusHariIni(r.Context(), s.userIDDiminta(a, r.URL.Query().Get("userId")))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, st)
}

func (s *Server) HandleRiwayat(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	q := r.URL.Query()
	var status *domain.AttendanceStatus
	if v := q.Get("status"); v != "" {
		st := domain.AttendanceStatus(v)
		if !stSah(st) {
			response.Galat(w, http.StatusBadRequest, "Status tidak dikenal.")
			return
		}
		status = &st
	}
	daftar, err := s.Presensi.Riwayat(r.Context(), a.UserID, q.Get("dari"), q.Get("sampai"), status)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}

func (s *Server) HandleKirimPresensi(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.KirimPresensi
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	hasil, err := s.Presensi.Kirim(r.Context(), a.UserID, cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, hasil)
}

// HandleAdminPresensi: GET /api/admin/presensi?tanggal= — baris monitoring.
func (s *Server) HandleAdminPresensi(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	daftar, err := s.Presensi.DaftarPresensi(r.Context(), pengguna(a), r.URL.Query().Get("tanggal"))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}
