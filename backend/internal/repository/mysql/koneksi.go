// Package mysql: implementasi port di atas database/sql + driver MySQL.
// Seluruh kueri memakai parameter terikat (bebas injeksi).
// Berkas di paket ini dikelompokkan per fitur: koneksi.go (koneksi & skema),
// lalu *_repo.go per entitas (pengguna, presensi, enrollment, pengajuan, …).
package mysql

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

// Buka: buka kolam koneksi MySQL dan pastikan server terjangkau.
func Buka(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * 60e9) // 5 menit
	if err := db.PingContext(context.Background()); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("mysql tidak terjangkau: %w", err)
	}
	return db, nil
}
