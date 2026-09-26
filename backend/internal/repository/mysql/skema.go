package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Migrasi: jalankan seluruh berkas migrations/*.sql berurutan, sekali per
// berkas (dilacak di tabel schema_migrations).
func Migrasi(ctx context.Context, db *sql.DB, dir string) error {
	if _, err := db.ExecContext(ctx,
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			nama VARCHAR(120) NOT NULL PRIMARY KEY,
			dijalankan_pada DATETIME(3) NOT NULL
		) ENGINE=InnoDB`); err != nil {
		return err
	}

	berkas, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("baca folder migrasi %q: %w", dir, err)
	}
	nama := make([]string, 0, len(berkas))
	for _, f := range berkas {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".sql") {
			nama = append(nama, f.Name())
		}
	}
	sort.Strings(nama)

	for _, n := range nama {
		var sudah int
		if err := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM schema_migrations WHERE nama = ?`, n).Scan(&sudah); err != nil {
			return err
		}
		if sudah > 0 {
			continue
		}
		sqlBytes, err := os.ReadFile(filepath.Join(dir, n))
		if err != nil {
			return err
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(sqlBytes)); err != nil {
			// MySQL DDL melakukan commit implisit. Bila proses terhenti sebelum INSERT
			// ke schema_migrations, DDL (tambah kolom/indeks) sudah terpasang.
			// Tangani kondisi duplikat agar migrasi tetap idempoten dan tidak gagal berulang.
			errStr := err.Error()
			if strings.Contains(errStr, "1061") || strings.Contains(errStr, "1060") {
				// Duplikat nama indeks atau kolom; lanjutkan untuk mencatat ke tabel schema_migrations
			} else {
				_ = tx.Rollback()
				return fmt.Errorf("migrasi %s: %w", n, err)
			}
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (nama, dijalankan_pada) VALUES (?, UTC_TIMESTAMP(3))`, n); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// PastikanKantor: semai kantor bila tabel masih kosong (idempoten).
func PastikanKantor(ctx context.Context, db *sql.DB, nama, id string, lat, lng float64, radius int) error {
	var ada int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM kantor`).Scan(&ada); err != nil {
		return err
	}
	if ada > 0 {
		return nil
	}
	_, err := db.ExecContext(ctx,
		`INSERT INTO kantor (id, nama, latitude, longitude, radius_meter) VALUES (?, ?, ?, ?, ?)`,
		id, nama, lat, lng, radius)
	return err
}
