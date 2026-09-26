package mysql

import (
	"context"
	"database/sql"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.LiburRepo = (*LiburRepo)(nil)

// LiburRepo: kalender hari libur desa.
type LiburRepo struct{ db *sql.DB }

func LiburRepoBaru(db *sql.DB) *LiburRepo { return &LiburRepo{db: db} }

const kolomLibur = `DATE_FORMAT(tanggal, '%Y-%m-%d'), nama, jenis, sumber`

// Rentang: hari libur pada [dari, sampai] (ISO, inklusif).
func (r *LiburRepo) Rentang(ctx context.Context, dari, sampai string) ([]domain.HariLibur, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomLibur+` FROM hari_libur WHERE tanggal BETWEEN ? AND ? ORDER BY tanggal`,
		dari, sampai)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	hasil := []domain.HariLibur{}
	for rows.Next() {
		h, err := pindaiLibur(rows)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, h)
	}
	return hasil, rows.Err()
}

// Satu: hari libur pada satu tanggal.
func (r *LiburRepo) Satu(ctx context.Context, tanggal string) (domain.HariLibur, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+kolomLibur+` FROM hari_libur WHERE tanggal = ?`, tanggal)
	h, err := pindaiLibur(row)
	if err == sql.ErrNoRows {
		return domain.HariLibur{}, domain.ErrTidakDitemukan
	}
	if err != nil {
		return domain.HariLibur{}, err
	}
	return h, nil
}

// Simpan: simpan atau ubah satu tanggal libur (upsert menurut tanggal).
func (r *LiburRepo) Simpan(ctx context.Context, h domain.HariLibur, now time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO hari_libur (tanggal, nama, jenis, sumber, dibuat_pada, diubah_pada)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE nama = VALUES(nama), jenis = VALUES(jenis),
		   sumber = VALUES(sumber), diubah_pada = VALUES(diubah_pada)`,
		h.Tanggal, h.Nama, string(h.Jenis), string(h.Sumber), now, now)
	return err
}

// Hapus: buang satu tanggal libur (tidak gagal bila tanggalnya memang tidak ada).
func (r *LiburRepo) Hapus(ctx context.Context, tanggal string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM hari_libur WHERE tanggal = ?`, tanggal)
	return err
}

// AdaTahun: apakah satu tahun sudah punya catatan.
func (r *LiburRepo) AdaTahun(ctx context.Context, tahun int) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM hari_libur WHERE YEAR(tanggal) = ?`, tahun).Scan(&n)
	return n > 0, err
}

// pemindai: baris hasil Query maupun QueryRow sama-sama bisa di-Scan.
type pemindai interface{ Scan(tujuan ...any) error }

func pindaiLibur(s pemindai) (domain.HariLibur, error) {
	var h domain.HariLibur
	var jenis, sumber string
	if err := s.Scan(&h.Tanggal, &h.Nama, &jenis, &sumber); err != nil {
		return domain.HariLibur{}, err
	}
	h.Jenis, h.Sumber = domain.JenisLibur(jenis), domain.SumberLibur(sumber)
	return h, nil
}
