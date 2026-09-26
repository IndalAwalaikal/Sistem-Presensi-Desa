package mysql

import (
	"context"
	"database/sql"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// AktivasiRepo: aktivasi akun dalam satu transaksi basis data. Lihat
// `port.AktivasiRepo` untuk alasan mengapa tiga tabel disentuh bersamaan.
type AktivasiRepo struct{ db *sql.DB }

func AktivasiRepoBaru(db *sql.DB) *AktivasiRepo { return &AktivasiRepo{db: db} }

var _ port.AktivasiRepo = (*AktivasiRepo)(nil)

// Aktivasi: kunci kode undangan lebih dahulu (itu penjaga balapan satu-satunya),
// lalu ubah kata sandi/status akun dan kontak/persetujuan. Semua dalam satu
// transaksi: bila salah satu langkah gagal, kodenya tidak ikut terbakar dan
// akunnya tidak setengah aktif.
func (r *AktivasiRepo) Aktivasi(ctx context.Context, p domain.PerintahAktivasi) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	sekarang := p.Sekarang.UTC()

	// 1) Rebut kode — `AND dipakai_pada IS NULL` membuat dua permintaan
	//    bersamaan hanya dapat lolos satu (yang kedua melihat 0 baris).
	res, err := tx.ExecContext(ctx,
		`UPDATE undangan SET dipakai_pada = ? WHERE kode = ? AND dipakai_pada IS NULL`,
		sekarang, p.Kode)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return domain.ErrKodeTerpakai
	}

	// 2) Kata sandi + status akun.
	res, err = tx.ExecContext(ctx,
		`UPDATE pengguna SET hash_sandi = ?, status_akun = ?, diubah_pada = ? WHERE id = ?`,
		p.HashSandi, domain.Aktif, sekarang, p.UserID)
	if err != nil {
		return domain.GalatBentrokDariDB(err, "NIP/NIK sudah dipakai akun lain.")
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return domain.ErrTidakDitemukan
	}

	// 3) Kontak & persetujuan pemrosesan data wajah.
	if _, err := tx.ExecContext(ctx,
		`UPDATE pengguna SET telepon = ?, alamat = ?, persetujuan_wajah_pada = ?, diubah_pada = ? WHERE id = ?`,
		p.Telepon, p.Alamat, p.Persetujuan.UTC(), sekarang, p.UserID); err != nil {
		return err
	}

	return tx.Commit()
}
