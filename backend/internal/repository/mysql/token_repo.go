package mysql

import (
	"context"
	"database/sql"
	"time"

	"presensi-anabanua/backend/internal/port"
)

var _ port.TokenRepo = (*TokenRepo)(nil)

// TokenRepo: sesi yang dicabut (logout). Pembersihan kedaluwarsa dijalankan
// saat pemeriksaan supaya tabel tetap kecil.
type TokenRepo struct{ db *sql.DB }

func TokenRepoBaru(db *sql.DB) *TokenRepo { return &TokenRepo{db: db} }

func (r *TokenRepo) Revoke(ctx context.Context, jti string, kedaluwarsa time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT IGNORE INTO sesi_dibatalkan (jti, kedaluwarsa) VALUES (?, ?)`,
		jti, kedaluwarsa.UTC())
	return err
}

func (r *TokenRepo) Revoked(ctx context.Context, jti string) (bool, error) {
	var n int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM sesi_dibatalkan WHERE jti = ?`, jti).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// Bersihkan: hapus jti yang sudah lewat masa berlakunya.
//
// UTC_TIMESTAMP(3), bukan NOW(3): kolom `kedaluwarsa` menyimpan waktu UTC (JWT
// dan `Revoke` menulis kedaluwarsa.UTC()), sedangkan container MySQL berjalan
// pada +08:00. Dengan NOW(3) baris tercabut dihapus delapan jam terlalu cepat —
// token yang dicuri dapat dipakai kembali selama sisa delapan jam itu.
func (r *TokenRepo) Bersihkan(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sesi_dibatalkan WHERE kedaluwarsa < UTC_TIMESTAMP(3)`)
	return err
}
