package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Enrollment: pendaftaran wajah (pengguna) & verifikasi (pengelola akun)
// ---------------------------------------------------------------------

func (s *Server) HandleEnrollmentSaya(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	userID := s.userIDDiminta(a, r.URL.Query().Get("userId"))
	e, err := s.Enroll.MilikSaya(r.Context(), userID)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	if e == nil {
		response.JSON(w, http.StatusOK, nil)
		return
	}
	response.JSON(w, http.StatusOK, e)
}

func (s *Server) HandleEnrollmentKirim(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.KirimEnrollment
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	e, err := s.Enroll.Kirim(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, e)
}

// HandleEnrollmentValidasiFoto: memeriksa satu foto tanpa menyimpannya.
func (s *Server) HandleEnrollmentValidasiFoto(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd struct {
		Image string `json:"image"`
	}
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	if err := s.Enroll.ValidasiFoto(r.Context(), pengguna(a), cmd.Image); err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"valid": true})
}

func (s *Server) HandleAdminEnrollmentPending(w http.ResponseWriter, r *http.Request) {
	daftar, err := s.Enroll.Pending(r.Context())
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}

func (s *Server) HandleAdminEnrollmentPutuskan(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd struct {
		Approve bool   `json:"approve"`
		Note    string `json:"note"`
	}
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	e, err := s.Enroll.Putuskan(r.Context(), pengguna(a), r.PathValue("id"), cmd.Approve, cmd.Note)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, e)
}
