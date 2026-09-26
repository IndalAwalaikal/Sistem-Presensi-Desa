package httpapi

import (
	"net/http"

	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/delivery/httpapi/response"
	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/usecase"
)

// ---------------------------------------------------------------------
// Pengajuan: WFH/izin/sakit/cuti/dinas luar — milik sendiri & keputusan
// ---------------------------------------------------------------------

func (s *Server) HandlePengajuanSaya(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	daftar, err := s.Pengajuan.MilikSaya(r.Context(), s.userIDDiminta(a, r.URL.Query().Get("userId")))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}

func (s *Server) HandlePengajuanKirim(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.KirimPengajuan
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	x, err := s.Pengajuan.Kirim(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, x)
}

func (s *Server) HandlePengajuanBatal(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	x, err := s.Pengajuan.Batalkan(r.Context(), pengguna(a), r.PathValue("id"))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, x)
}

func (s *Server) HandleAdminDaftarPengajuan(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var status *domain.RequestStatus
	if v := r.URL.Query().Get("status"); v != "" {
		st := domain.RequestStatus(v)
		if !statusSah(st) {
			response.Galat(w, http.StatusBadRequest, "Status pengajuan tidak dikenal.")
			return
		}
		status = &st
	}
	daftar, err := s.Pengajuan.DaftarPengajuan(r.Context(), pengguna(a), status)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, daftar)
}

// HandleAdminPutuskanPengajuan: satu keputusan untuk satu pengajuan.
func (s *Server) HandleAdminPutuskanPengajuan(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdPutuskan
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	x, err := s.Pengajuan.PutuskanPengajuan(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, x)
}

// HandleAdminPengajuanMassal: POST /api/admin/pengajuan/massal — satu pengajuan
// (mis. cuti bersama) untuk banyak perangkat sekaligus.
func (s *Server) HandleAdminPengajuanMassal(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	var cmd usecase.CmdPengajuanMassal
	if !response.Dekode(w, r, s.CFG.MaxBodyBytes, &cmd) {
		return
	}
	hasil, err := s.Pengajuan.KirimMassal(r.Context(), pengguna(a), cmd)
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, hasil)
}

// HandleAdminPengajuanMenunggu: jumlah MENUNGGU untuk lencana notifikasi.
func (s *Server) HandleAdminPengajuanMenunggu(w http.ResponseWriter, r *http.Request) {
	a := middleware.AktorDari(r.Context())
	n, err := s.Pengajuan.PengajuanMenunggu(r.Context(), pengguna(a))
	if err != nil {
		response.TulisGalat(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]int{"jumlah": n})
}
