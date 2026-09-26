package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Konfigurasi: lokasi kantor & jam kerja (dibaca semua, diubah pengelola)
// ---------------------------------------------------------------------

func (s *Server) HandleKonfigurasi(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.Presensi.Konfigurasi(r.Context())
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, cfg)
}

func (s *Server) HandleAdminSimpanJadwal(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdJadwal
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	j, err := s.Konfigurasi.SimpanJadwal(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, j)
}

// HandleAdminSimpanKantor: POST /api/admin/kantor — titik & radius geofence.
func (s *Server) HandleAdminSimpanKantor(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd struct {
		Name         string  `json:"name"`
		Latitude     float64 `json:"latitude"`
		Longitude    float64 `json:"longitude"`
		RadiusMeters int     `json:"radiusMeters"`
	}
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	k, err := s.Konfigurasi.SimpanKantor(r.Context(), pengguna(a),
		cmd.Name, cmd.Latitude, cmd.Longitude, cmd.RadiusMeters)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, k)
}

// HandleAdminDaftarJadwalKhusus: GET /api/admin/jadwal-khusus
func (s *Server) HandleAdminDaftarJadwalKhusus(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	daftar, err := s.Konfigurasi.DaftarJadwalKhusus(r.Context(), pengguna(a))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}

// HandleAdminSimpanJadwalKhusus: POST /api/admin/jadwal-khusus
func (s *Server) HandleAdminSimpanJadwalKhusus(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdJadwalKhusus
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	jk, err := s.Konfigurasi.SimpanJadwalKhusus(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, jk)
}

// HandleAdminHapusJadwalKhusus: DELETE /api/admin/jadwal-khusus/{id}
func (s *Server) HandleAdminHapusJadwalKhusus(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	id := r.PathValue("id")
	if err := s.Konfigurasi.HapusJadwalKhusus(r.Context(), pengguna(a), id); err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"pesan": "Jadwal khusus berhasil dihapus"})
}
