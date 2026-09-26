// Package middleware: urusan lintas-potong HTTP — konteks aktor, autentikasi,
// kewenangan, header keamanan, CORS, dan pemulihan panic. Tidak tahu detail
// JWT/MySQL: sumber sesi disuntikkan lewat antarmuka PenyediaSesi.
package middleware

import (
	"context"
	"time"

	"presensi-anabanua/backend/internal/domain"
)

type konteksKunci struct{}

// Aktor: pengguna yang sedang masuk dalam konteks permintaan.
type Aktor struct {
	UserID      string
	Role        domain.Role
	JTI         string
	Kedaluwarsa time.Time
	User        *domain.User
}

func DenganAktor(ctx context.Context, a *Aktor) context.Context {
	return context.WithValue(ctx, konteksKunci{}, a)
}

// AktorDari: ambil aktor dari konteks (nil bila permintaan belum terautentikasi).
func AktorDari(ctx context.Context) *Aktor {
	a, _ := ctx.Value(konteksKunci{}).(*Aktor)
	return a
}
