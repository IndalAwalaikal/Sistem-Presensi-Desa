// Package httpapi: lapisan presentasi HTTP. Handler dikelompokkan per fitur
// (auth_handler.go, pengguna_handler.go, presensi_handler.go, …); urusan
// lintas-potong ada di subpaket middleware, bentuk tanggapan di response.
package httpapi

import (
	"context"
	"errors"

	"presensi-anabanua/backend/internal/config"
	"presensi-anabanua/backend/internal/delivery/httpapi/middleware"
	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
	"presensi-anabanua/backend/internal/security"
	"presensi-anabanua/backend/internal/usecase"
)

// Server: seluruh dependensi lapisan HTTP (usecase, keamanan, konfigurasi).
type Server struct {
	CFG *config.Config
	// HealthCheck memeriksa dependensi penting agar health endpoint menjadi
	// readiness check, bukan sekadar tanda bahwa proses HTTP hidup.
	HealthCheck func(context.Context) error

	Auth        *usecase.AuthUsecase
	Presensi    *usecase.PresensiUsecase
	Enroll      *usecase.EnrollUsecase
	Pengajuan   *usecase.PengajuanUsecase
	Pengguna    *usecase.PenggunaUsecase
	Konfigurasi *usecase.KonfigurasiUsecase
	Laporan     *usecase.LaporanUsecase
	Libur       *usecase.LiburUsecase
	Audit       *usecase.AuditUsecase
	Profil      *usecase.ProfilUsecase
	Disiplin    *usecase.DisiplinUsecase

	Token     *security.Tokenizer
	TokenRepo port.TokenRepo
	Rate      *security.RateLimiter
}

// SesiAktor: ubah token menjadi aktor — implementasi middleware.PenyediaSesi.
// Pengguna dimuat ulang setiap permintaan supaya akun yang dinonaktifkan (atau
// token yang dicabut saat keluar) langsung tidak berlaku.
func (s *Server) SesiAktor(ctx context.Context, tokenStr string) (*middleware.Aktor, error) {
	klaim, err := s.Token.Baca(tokenStr)
	if err != nil {
		return nil, err
	}
	cabut, err := s.TokenRepo.Revoked(ctx, klaim.ID)
	if err != nil {
		return nil, err
	}
	if cabut {
		return nil, domain.ErrSesiKadaluwarsa
	}
	u, err := s.Auth.Saya(ctx, klaim.Subject)
	if err != nil {
		if errors.Is(err, domain.ErrTidakDitemukan) {
			return nil, domain.ErrSesiKadaluwarsa
		}
		return nil, err
	}
	if u.AccountStatus != domain.Aktif {
		return nil, domain.ErrAkunTidakAktif
	}
	return &middleware.Aktor{
		UserID: klaim.Subject, Role: domain.Role(klaim.Peran),
		JTI: klaim.ID, Kedaluwarsa: klaim.ExpiresAt.Time, User: u,
	}, nil
}
