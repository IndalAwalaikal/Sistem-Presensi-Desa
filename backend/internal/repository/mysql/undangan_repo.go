package mysql

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.UndanganRepo = (*UndanganRepo)(nil)

type UndanganRepo struct{ db *sql.DB }

func UndanganRepoBaru(db *sql.DB) *UndanganRepo { return &UndanganRepo{db: db} }

func pindaiUndangan(scan func(...any) error) (*domain.Undangan, error) {
	var (
		u           domain.Undangan
		dibuat      time.Time
		kedaluwarsa time.Time
		dipakai     sql.NullTime
	)
	if err := scan(&u.Kode, &u.UserID, &u.Nama, &u.Email, &dibuat, &kedaluwarsa, &dipakai); err != nil {
		return nil, err
	}
	u.DibuatPada = domain.WaktuISO(dibuat)
	u.KedaluwarsaPada = domain.WaktuISO(kedaluwarsa)
	if dipakai.Valid {
		s := domain.WaktuISO(dipakai.Time)
		u.DipakaiPada = &s
	}
	return &u, nil
}

func (r *UndanganRepo) ByKode(ctx context.Context, kode string) (*domain.Undangan, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT kode, pengguna_id, nama, email, diterbitkan_pada, kedaluwarsa_pada, dipakai_pada
		 FROM undangan WHERE kode = ? LIMIT 1`, kode)
	u, err := pindaiUndangan(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrTidakDitemukan
	}
	return u, err
}

func (r *UndanganRepo) Create(ctx context.Context, u *domain.Undangan) error {
	dibuat, _ := time.Parse(time.RFC3339Nano, u.DibuatPada)
	kedaluwarsa, _ := time.Parse(time.RFC3339Nano, u.KedaluwarsaPada)
	_, err := r.db.ExecContext(ctx, `INSERT INTO undangan
		(kode, pengguna_id, nama, email, diterbitkan_pada, kedaluwarsa_pada, dipakai_pada)
		VALUES (?, ?, ?, ?, ?, ?, NULL)`,
		u.Kode, u.UserID, u.Nama, u.Email, dibuat.UTC(), kedaluwarsa.UTC())
	return err
}

func (r *UndanganRepo) List(ctx context.Context) ([]domain.Undangan, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT kode, pengguna_id, nama, email, diterbitkan_pada, kedaluwarsa_pada, dipakai_pada
		 FROM undangan ORDER BY diterbitkan_pada DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.Undangan{}
	for rows.Next() {
		u, err := pindaiUndangan(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *u)
	}
	return hasil, rows.Err()
}

// GugurkanBelumDipakai: tarik masa berlaku kode yang belum dipakai hingga
// sekarang — setara "digugurkan", tanpa mengubah kode yang sudah dipakai.
//
// UTC_TIMESTAMP(3), bukan NOW(3): kolom DATETIME diperlakukan sebagai UTC
// (DSN memakai loc=UTC) sedangkan container MySQL berjalan pada +08:00 — dengan
// NOW(3) kode akan dianggap gugur delapan jam lebih awal.
func (r *UndanganRepo) GugurkanBelumDipakai(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE undangan SET kedaluwarsa_pada = UTC_TIMESTAMP(3)
		 WHERE pengguna_id = ? AND dipakai_pada IS NULL AND kedaluwarsa_pada > UTC_TIMESTAMP(3)`,
		userID)
	return err
}
