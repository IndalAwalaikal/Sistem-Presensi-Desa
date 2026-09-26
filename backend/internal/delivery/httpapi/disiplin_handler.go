package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
)

// ---------------------------------------------------------------------
// Kabar kedisiplinan (webhook ke kanal luar, mis. grup WhatsApp desa)
// ---------------------------------------------------------------------

// HandleAdminDisiplinStatus: apakah webhook diset — dipakai layar pengaturan
// untuk mematikan tombol kirim saat fitur belum dikonfigurasi.
func (s *Server) HandleAdminDisiplinStatus(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, map[string]bool{"aktif": s.Disiplin.Aktif()})
}

// HandleAdminDisiplinRingkasan: GET /api/admin/disiplin/ringkasan?tanggal=… —
// hitung ringkasan kedisiplinan satu hari tanpa mengirimkannya (pratinjau).
func (s *Server) HandleAdminDisiplinRingkasan(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	ringkasan, err := s.Disiplin.RingkasanHari(r.Context(), pengguna(a), r.URL.Query().Get("tanggal"))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, ringkasan)
}

// HandleAdminDisiplinKirim: POST /api/admin/disiplin/kirim — hitung ringkasan
// hari itu lalu kirimkan ke webhook; yang dikembalikan tetap ringkasannya supaya
// pengelola akun melihat persis apa yang diberitakan.
func (s *Server) HandleAdminDisiplinKirim(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	ringkasan, terkirim, err := s.Disiplin.KirimRingkasanHari(r.Context(), pengguna(a), r.URL.Query().Get("tanggal"))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"terkirim":  terkirim,
		"ringkasan": ringkasan,
	})
}
