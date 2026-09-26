package httpapi

import (
	"net/http"
	"strconv"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
)

// ---------------------------------------------------------------------
// Laporan: rekap kedisiplinan bulanan (khusus pengelola akun)
// ---------------------------------------------------------------------

func (s *Server) HandleAdminRekap(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	tahun, errT := strconv.Atoi(r.URL.Query().Get("tahun"))
	bulan, errB := strconv.Atoi(r.URL.Query().Get("bulan"))
	if errT != nil || errB != nil {
		response.Galat(w, http.StatusBadRequest, "Tahun dan bulan wajib angka.")
		return
	}
	rows, err := s.Laporan.RekapBulanan(r.Context(), pengguna(a), tahun, bulan)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, rows)
}
