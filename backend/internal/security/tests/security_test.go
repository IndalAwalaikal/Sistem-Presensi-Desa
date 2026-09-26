package security_test

import (
	"testing"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/security"
)

const rahasia = "kunci-uji-panjang-dan-acak-minimal-32-karakter"

func pengguna() *domain.User {
	return &domain.User{ID: "usr-abc123", FullName: "Budi", Role: domain.PerangkatDesa}
}

func TestTokenTerbitkanBaca(t *testing.T) {
	tk := security.TokenBaru(rahasia, 12*time.Hour)
	token, jti, kedaluwarsa, err := tk.Terbitkan(pengguna())
	if err != nil {
		t.Fatalf("terbitkan: %v", err)
	}
	if jti == "" || token == "" {
		t.Fatal("token/jti kosong")
	}
	if !kedaluwarsa.After(time.Now()) {
		t.Fatal("kedaluwarsa harus di masa depan")
	}
	klaim, err := tk.Baca(token)
	if err != nil {
		t.Fatalf("baca: %v", err)
	}
	if klaim.Subject != "usr-abc123" || klaim.Peran != "PERANGKAT_DESA" || klaim.ID != jti {
		t.Errorf("klaim tidak sesuai: %+v", klaim)
	}
}

func TestTokenTolakKunciSalah(t *testing.T) {
	tk := security.TokenBaru(rahasia, 12*time.Hour)
	token, _, _, _ := tk.Terbitkan(pengguna())

	lain := security.TokenBaru("kunci-lain-yang-juga-panjang-sekali-32-char", 12*time.Hour)
	if _, err := lain.Baca(token); err == nil {
		t.Error("token dengan kunci lain harus ditolak")
	}
}

func TestTokenKedaluwarsa(t *testing.T) {
	tk := security.TokenBaru(rahasia, -time.Hour) // sudah lewat
	token, _, _, _ := tk.Terbitkan(pengguna())
	if _, err := tk.Baca(token); err == nil {
		t.Error("token kedaluwarsa harus ditolak")
	}
}

func TestTokenAlgoritmaDipaksakan(t *testing.T) {
	// Token "none" klasik harus ditolak.
	tidakSah := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.e30."
	if _, err := security.TokenBaru(rahasia, time.Hour).Baca(tidakSah); err == nil {
		t.Error("algoritma none harus ditolak")
	}
}

func TestRateLimiter(t *testing.T) {
	rl := security.RateLimiterBaru(3, time.Minute)
	for i := 0; i < 3; i++ {
		if !rl.Boleh("ip1") {
			t.Fatalf("percobaan %d seharusnya boleh", i+1)
		}
	}
	if rl.Boleh("ip1") {
		t.Error("percobaan ke-4 harus ditolak")
	}
	if !rl.Boleh("ip2") {
		t.Error("kunci lain tidak boleh terpengaruh")
	}
	if rl.Sisa("ip1") <= 0 {
		t.Error("sisa tunggu harus positif")
	}
}

func TestSandiHashCek(t *testing.T) {
	hash, err := security.HashSandi("anabanua-aman-123", 10)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "anabanua-aman-123" {
		t.Error("hash tidak boleh sama dengan sandi")
	}
	if !security.CekSandi(hash, "anabanua-aman-123") {
		t.Error("sandi benar harus cocok")
	}
	if security.CekSandi(hash, "salah") {
		t.Error("sandi salah tidak boleh cocok")
	}
}
