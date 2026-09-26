// Package seed: menyiapkan data awal yang tidak dapat dibuat dari aplikasi —
// akun administratif (sekretaris & kepala desa). Idempoten: akun yang sudah
// ada tidak disentuh. Kata sandi selalu dari env (hash bcrypt di sini).
package seed

import (
	"context"
	"log"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

type AkunAdmin struct {
	Email   string
	Nama    string
	NIP     string
	Sandi   string
	Peran   domain.Role
	Jabatan string
	Unit    string
}

// PastikanAkunAdmin: buat akun yang belum ada; kembalikan daftar yang baru dibuat.
func PastikanAkunAdmin(ctx context.Context, users port.UserRepo, bcryptCost int, akun []AkunAdmin) ([]string, error) {
	dibuat := []string{}
	for _, a := range akun {
		a.Email = strings.ToLower(strings.TrimSpace(a.Email))
		if a.Email == "" || a.Sandi == "" {
			continue // tanpa kata sandi di env → lewati (dengan log di pemanggil)
		}
		_, err := users.ByEmail(ctx, a.Email)
		if err == nil {
			continue // sudah ada — jangan disentuh
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(a.Sandi), bcryptCost)
		if err != nil {
			return dibuat, err
		}
		sandi := string(hash)
		u := &domain.PenggunaInternal{User: domain.User{
			ID:              domain.IDBaru("usr"),
			FullName:        a.Nama,
			Email:           a.Email,
			Role:            a.Peran,
			AccountStatus:   domain.Aktif,
			BiometricStatus: domain.BiometrikBelum,
			Official: domain.Official{
				EmployeeID: a.NIP,
				Position:   a.Jabatan,
				Unit:       a.Unit,
			},
		}, HashSandi: &sandi}
		if err := users.Create(ctx, u); err != nil {
			return dibuat, err
		}
		dibuat = append(dibuat, a.Email)
	}
	return dibuat, nil
}

// Jalankan: semai akun administratif dari konfigurasi; catat ke log.
func Jalankan(ctx context.Context, users port.UserRepo, bcryptCost int, akun []AkunAdmin) {
	dibuat, err := PastikanAkunAdmin(ctx, users, bcryptCost, akun)
	if err != nil {
		log.Printf("PERINGATAN: penyemaian akun administratif gagal: %v", err)
		return
	}
	for _, email := range dibuat {
		log.Printf("akun administratif baru dibuat: %s", email)
	}
}
