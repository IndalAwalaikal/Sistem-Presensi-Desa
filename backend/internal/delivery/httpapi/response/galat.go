package response

import (
	"errors"
	"log"
	"net/http"

	"presensi-anabanua/backend/internal/domain"
)

// TulisGalat: peta error → status + pesan. Pesan domain ditampilkan apa
// adanya; galat tak terduga disamarkan (jangan bocorkan internal).
func TulisGalat(w http.ResponseWriter, err error) {
	var v *domain.GalatValidasi
	if errors.As(err, &v) {
		Galat(w, http.StatusBadRequest, v.Pesan)
		return
	}
	var k *domain.GalatKewenangan
	if errors.As(err, &k) {
		Galat(w, http.StatusForbidden, k.Pesan)
		return
	}
	var b *domain.GalatBentrok
	if errors.As(err, &b) {
		Galat(w, http.StatusConflict, b.Pesan)
		return
	}
	switch {
	case errors.Is(err, domain.ErrTidakDitemukan):
		Galat(w, http.StatusNotFound, "Data tidak ditemukan.")
	case errors.Is(err, domain.ErrKredensial):
		Galat(w, http.StatusUnauthorized, "Email atau kata sandi salah.")
	case errors.Is(err, domain.ErrAkunTidakAktif):
		Galat(w, http.StatusForbidden, "Akun dinonaktifkan. Hubungi sekretaris desa.")
	case errors.Is(err, domain.ErrAkunBelumAktivasi):
		Galat(w, http.StatusForbidden, "Akun belum diaktivasi. Gunakan kode undangan dari sekretaris desa.")
	case errors.Is(err, domain.ErrKodeSalah):
		Galat(w, http.StatusBadRequest, "Kode aktivasi tidak dikenal. Periksa kembali atau minta kode baru.")
	case errors.Is(err, domain.ErrKodeTerpakai):
		Galat(w, http.StatusConflict, "Kode aktivasi sudah pernah dipakai.")
	case errors.Is(err, domain.ErrKodeKedaluwarsa):
		Galat(w, http.StatusConflict, "Kode aktivasi sudah kedaluwarsa.")
	case errors.Is(err, domain.ErrSesiKadaluwarsa):
		Galat(w, http.StatusUnauthorized, "Sesi tidak berlaku. Silakan masuk kembali.")
	case errors.Is(err, domain.ErrKewenangan):
		Galat(w, http.StatusForbidden, "Kewenangan tidak memadai.")
	default:
		log.Printf("[galat] %T: %v", err, err)
		Galat(w, http.StatusInternalServerError, "Terjadi kesalahan di server. Coba lagi beberapa saat.")
	}
}
