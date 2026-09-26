package domain

import (
	"errors"
	"fmt"
)

// ---------------------------------------------------------------------
// Galat domain — seluruhnya dipetakan ke status HTTP di lapisan delivery
// (lihat delivery/httpapi/response/galat.go).
// ---------------------------------------------------------------------

// Sentinel errors: dibandingkan dengan errors.Is di lapisan HTTP.
var (
	ErrTidakDitemukan    = errors.New("data tidak ditemukan")
	ErrKredensial        = errors.New("email atau kata sandi salah")
	ErrAkunTidakAktif    = errors.New("akun dinonaktifkan")
	ErrAkunBelumAktivasi = errors.New("akun belum diaktivasi")
	ErrKodeSalah         = errors.New("kode aktivasi tidak dikenal")
	ErrKodeTerpakai      = errors.New("kode aktivasi sudah pernah dipakai")
	ErrKodeKedaluwarsa   = errors.New("kode aktivasi sudah kedaluwarsa")
	ErrKewenangan        = errors.New("kewenangan tidak memadai")
	ErrSesiKadaluwarsa   = errors.New("sesi tidak berlaku")
	ErrValidasi          = errors.New("data tidak sah")
	ErrBentrok           = errors.New("data bentrok")
)

// GalatValidasi: galat bisnis dengan pesan siap-tampil; dipetakan ke 400.
type GalatValidasi struct{ Pesan string }

func (e *GalatValidasi) Error() string { return e.Pesan }

// GalatKewenangan: 403.
type GalatKewenangan struct{ Pesan string }

func (e *GalatKewenangan) Error() string { return e.Pesan }

// GalatBentrok: 409.
type GalatBentrok struct{ Pesan string }

func (e *GalatBentrok) Error() string { return e.Pesan }

// GalatBentrokDariDB: petakan galat duplikat kunci basis data (MySQL 1062)
// menjadi GalatBentrok (HTTP 409) dengan pesan ramah; galat lain diteruskan.
func GalatBentrokDariDB(err error, pesan string) error {
	if err == nil {
		return nil
	}
	teks := err.Error()
	if containsFold(teks, "duplicate entry") || containsFold(teks, "error 1062") {
		return &GalatBentrok{Pesan: pesan}
	}
	return err
}

func containsFold(s, sub string) bool {
	if len(s) < len(sub) {
		return false
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			a, b := s[i+j], sub[j]
			if a >= 'A' && a <= 'Z' {
				a += 'a' - 'A'
			}
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if a != b {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func Galatf(format string, a ...any) error { return fmt.Errorf(format, a...) }
