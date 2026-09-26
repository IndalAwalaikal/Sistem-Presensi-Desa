// Package usecase: aturan bisnis. Hanya bergantung pada domain dan port.
package usecase

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

type AuthUsecase struct {
	users      port.UserRepo
	undangan   port.UndanganRepo
	aktivasi   port.AktivasiRepo
	tokenRepo  port.TokenRepo
	token      TokenIssuer
	audit      port.AuditRepo
	bcryptCost int
	sekarang   func() time.Time
}

// TokenIssuer: abstraksi penerbit sesi (implementasi: security.Tokenizer).
type TokenIssuer interface {
	Terbitkan(u *domain.User) (token, jti string, kedaluwarsa time.Time, err error)
}

func AuthBaru(users port.UserRepo, und port.UndanganRepo, aktivasi port.AktivasiRepo, tokens port.TokenRepo, t TokenIssuer, audit port.AuditRepo, cost int) *AuthUsecase {
	return &AuthUsecase{users: users, undangan: und, aktivasi: aktivasi, tokenRepo: tokens, token: t, audit: audit, bcryptCost: cost, sekarang: time.Now}
}

type HasilLogin struct {
	Pengguna *domain.User `json:"pengguna"`
	Token    string       `json:"token"`
}

// Masuk: periksa kredensial dan status akun; terbitkan sesi.
func (uc *AuthUsecase) Masuk(ctx context.Context, email, sandi string) (*HasilLogin, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || sandi == "" {
		return nil, domain.ErrKredensial
	}
	u, err := uc.users.ByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrTidakDitemukan) {
			// Sama pesannya dengan sandi salah: jangan bocorkan keberadaan akun.
			return nil, domain.ErrKredensial
		}
		return nil, err
	}
	switch {
	case u.HashSandi == nil:
		return nil, domain.ErrKredensial
	case u.AccountStatus == domain.Nonaktif:
		return nil, domain.ErrKredensial
	case u.AccountStatus == domain.StatusUndangan:
		return nil, domain.ErrKredensial
	}
	if !sandiCocok(*u.HashSandi, sandi) {
		return nil, domain.ErrKredensial
	}
	token, _, _, err := uc.token.Terbitkan(&u.User)
	if err != nil {
		return nil, err
	}
	return &HasilLogin{Pengguna: &u.User, Token: token}, nil
}

// Keluar: batalkan sesi di sisi server (jti masuk daftar cabut).
func (uc *AuthUsecase) Keluar(ctx context.Context, jti string, kedaluwarsa time.Time) error {
	if jti == "" {
		return nil
	}
	return uc.tokenRepo.Revoke(ctx, jti, kedaluwarsa)
}

// Saya: pengguna sesi aktif; ErrTidakDitemukan bila tidak ada.
func (uc *AuthUsecase) Saya(ctx context.Context, id string) (*domain.User, error) {
	u, err := uc.users.ByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &u.User, nil
}

// RincianUndangan: endpoint publik — kode dilihat di halaman aktivasi.
func (uc *AuthUsecase) RincianUndangan(ctx context.Context, kodeKotor string) (*domain.Undangan, error) {
	kode := normalkanKode(kodeKotor)
	if kode == "" {
		return nil, nil
	}
	u, err := uc.undangan.ByKode(ctx, kode)
	if err != nil {
		if errors.Is(err, domain.ErrTidakDitemukan) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

// Aktivasi: pakai kode sekali — tetapkan sandi sendiri, lengkapi kontak,
// catat persetujuan biometrik, lalu sesi langsung terbuka.
func (uc *AuthUsecase) Aktivasi(ctx context.Context, kodeKotor string, cmd AktivasiCmd) (*HasilLogin, error) {
	kode := normalkanKode(kodeKotor)
	if kode == "" {
		return nil, domain.ErrKodeSalah
	}
	if galat := validasiSandi(cmd.Password); galat != "" {
		return nil, galatValidasi(galat)
	}
	if strings.TrimSpace(cmd.PhoneNumber) == "" {
		return nil, galatValidasi("Nomor telepon wajib diisi saat aktivasi.")
	}
	if !cmd.ConsentBiometrik {
		return nil, galatValidasi("Persetujuan pemrosesan data wajah wajib diberikan untuk melanjutkan.")
	}

	u, err := uc.undangan.ByKode(ctx, kode)
	if err != nil {
		if errors.Is(err, domain.ErrTidakDitemukan) {
			return nil, domain.ErrKodeSalah
		}
		return nil, err
	}
	now := uc.sekarang()
	if !domain.UndanganSah(*u, now) {
		if pesan := domain.PesanKodeTidakSah(*u, now); pesan != "" {
			return nil, galatValidasi(pesan)
		}
		return nil, domain.ErrKodeSalah
	}

	hash, err := hashSandi(cmd.Password, uc.bcryptCost)
	if err != nil {
		return nil, err
	}
	// Satu transaksi: kunci kode undangan, ganti sandi + status akun, catat
	// kontak & persetujuan. Tidak ada lagi urutan "akun aktif dahulu, kode
	// terkunci belakangan" yang dapat menyisakan akun aktif tanpa kode terpakai.
	if err := uc.aktivasi.Aktivasi(ctx, domain.PerintahAktivasi{
		UserID:      u.UserID,
		HashSandi:   hash,
		Telepon:     cmd.PhoneNumber,
		Alamat:      cmd.Address,
		Persetujuan: now,
		Kode:        kode,
		Sekarang:    now,
	}); err != nil {
		return nil, err
	}

	pengguna, err := uc.users.ByID(ctx, u.UserID)
	if err != nil {
		return nil, err
	}
	segarkan, _, _, err := uc.token.Terbitkan(&pengguna.User)
	if err != nil {
		return nil, err
	}
	// Jejak audit: aktivasi akun oleh pemiliknya sendiri.
	if uc.audit != nil {
		_ = uc.audit.Create(ctx, domain.AuditBaru(&pengguna.User, "MENGAKTIFKAN_AKUN", "User", pengguna.ID,
			"Akun "+pengguna.FullName+" diaktivasi memakai kode undangan.", now))
	}
	return &HasilLogin{Pengguna: &pengguna.User, Token: segarkan}, nil
}

type AktivasiCmd struct {
	Password         string `json:"password"`
	PhoneNumber      string `json:"phoneNumber"`
	Address          string `json:"address"`
	ConsentBiometrik bool   `json:"consentBiometrik"`
}

// ---------------------------------------------------------------------
// Alat bantu
// ---------------------------------------------------------------------

func normalkanKode(k string) string {
	h := strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return unicode.ToUpper(r)
	}, k)
	return h
}

func validasiSandi(s string) string {
	if len(s) < 8 {
		return "Kata sandi minimal 8 karakter."
	}
	if len(s) > 128 {
		return "Kata sandi maksimal 128 karakter."
	}
	return ""
}
