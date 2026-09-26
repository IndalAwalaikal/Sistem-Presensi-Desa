package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
)

// ---------------------------------------------------------------------
// Jejak audit: siapa melakukan apa (khusus pengelola akun)
// ---------------------------------------------------------------------

func (s *Server) HandleAdminAudit(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	daftar, err := s.Audit.DaftarAudit(r.Context(), pengguna(a))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}
