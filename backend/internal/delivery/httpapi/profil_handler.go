package httpapi

// Profil pemilik akun: telepon & alamat sendiri, dan penggantian kata sandi.
// Identitas kepegawaian tidak punya endpoint di sini — nilainya bersumber dari
// berkas kepegawaian desa (domain.FieldIdentitasTerkunci).

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/usecase"
)

// HandleProfilUbahKontak: POST /api/profil — id selalu dari sesi pemanggil.
func (s *Server) HandleProfilUbahKontak(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdKontak
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	u, err := s.Profil.UbahKontak(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, u)
}

// HandleProfilUbahSandi: POST /api/profil/sandi — sandi lama sebagai bukti,
// sandi baru tidak pernah dikembalikan maupun dicatat di jejak audit.
func (s *Server) HandleProfilUbahSandi(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdUbahSandi
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	if err := s.Profil.UbahSandi(r.Context(), pengguna(a), cmd); err != nil {
		response.TulisGalat(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
