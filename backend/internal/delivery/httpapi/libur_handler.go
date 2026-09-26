package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Kalender hari libur: dibaca semua pengguna, diubah pengelola akun
// ---------------------------------------------------------------------

// HandleLiburTahun: GET /api/libur?tahun=2026 — hari libur satu tahun.
// Tanpa parameter, tahun yang dipakai adalah tahun berjalan menurut WITA.
func (s *Server) HandleLiburTahun(w http.ResponseWriter, r *http.Request) {
	tahun := time.Now().In(domain.WITA).Year()
	if q := r.URL.Query().Get("tahun"); q != "" {
		n, err := strconv.Atoi(q)
		if err != nil {
			response.Galat(w, http.StatusBadRequest, "Tahun tidak sah.")
			return
		}
		tahun = n
	}
	hari, err := s.Libur.Tahun(r.Context(), tahun)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, hari)
}

// HandleAdminSimpanLibur: POST /api/admin/libur — tambah atau ubah satu tanggal
// libur (mis. libur lokal desa); tercatat `MENAMBAH_`/`MENGUBAH_HARI_LIBUR`.
func (s *Server) HandleAdminSimpanLibur(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdLibur
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	h, err := s.Libur.Simpan(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, h)
}

// HandleAdminHapusLibur: POST /api/admin/libur/{tanggal}/hapus — buang satu
// tanggal libur (mis. cuti bersama yang dicabut pemerintah).
func (s *Server) HandleAdminHapusLibur(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	tanggal := r.PathValue("tanggal")
	if err := s.Libur.Hapus(r.Context(), pengguna(a), tanggal); err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"tanggal": tanggal, "status": "dihapus"})
}

// HandleAdminImporLibur: POST /api/admin/libur/impor {"tahun":2026} — tarik
// kalender resmi dari sumber yang diset di env; tercatat `MENGIMPOR_HARI_LIBUR`.
func (s *Server) HandleAdminImporLibur(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd struct {
		Tahun int `json:"tahun"`
	}
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	hasil, err := s.Libur.Impor(r.Context(), pengguna(a), cmd.Tahun)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, hasil)
}
