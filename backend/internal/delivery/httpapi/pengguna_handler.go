package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Pengguna: pengelolaan akun perangkat desa & kode undangannya
// ---------------------------------------------------------------------

func (s *Server) HandleAdminDaftarPengguna(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	daftar, err := s.Pengguna.DaftarPengguna(r.Context(), pengguna(a))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}

func (s *Server) HandleAdminBuatPengguna(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdBuatPengguna
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	u, und, err := s.Pengguna.BuatPengguna(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"user": u, "undangan": und})
}

func (s *Server) HandleAdminUbahStatus(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdStatus
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	u, err := s.Pengguna.UbahStatus(r.Context(), pengguna(a), r.PathValue("id"), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, u)
}

func (s *Server) HandleAdminResetSandi(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	u, und, err := s.Pengguna.ResetSandi(r.Context(), pengguna(a), r.PathValue("id"))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"user": u, "undangan": und})
}

func (s *Server) HandleAdminDaftarUndangan(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	daftar, err := s.Pengguna.DaftarUndangan(r.Context(), pengguna(a))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}
