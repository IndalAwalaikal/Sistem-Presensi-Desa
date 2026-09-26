package mysql

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.PengajuanRepo = (*PengajuanRepo)(nil)

type PengajuanRepo struct{ db *sql.DB }

func PengajuanRepoBaru(db *sql.DB) *PengajuanRepo { return &PengajuanRepo{db: db} }

const kolomPengajuan = `id, jenis, pengguna_id, nama_pengguna, mulai, selesai, alasan, status,
	dibuat_pada, diputus_pada, diputus_oleh, catatan_keputusan, batch_id`

func pindaiPengajuan(scan func(...any) error) (*domain.WorkRequest, error) {
	var (
		r       domain.WorkRequest
		mulai   time.Time
		selesai time.Time
		dibuat  time.Time
		diputus sql.NullTime
		oleh    sql.NullString
		catatan sql.NullString
		batch   sql.NullString
	)
	if err := scan(&r.ID, &r.Type, &r.UserID, &r.UserName, &mulai, &selesai, &r.Reason,
		&r.Status, &dibuat, &diputus, &oleh, &catatan, &batch); err != nil {
		return nil, err
	}
	r.StartDate = mulai.Format("2006-01-02")
	r.EndDate = selesai.Format("2006-01-02")
	r.CreatedAt = domain.WaktuISO(dibuat)
	if diputus.Valid {
		s := domain.WaktuISO(diputus.Time)
		r.DecidedAt = &s
	}
	if oleh.Valid {
		s := oleh.String
		r.DecidedByName = &s
	}
	if catatan.Valid {
		s := catatan.String
		r.DecisionNote = &s
	}
	if batch.Valid {
		r.BatchID = batch.String
	}
	return &r, nil
}

func (r *PengajuanRepo) ByUser(ctx context.Context, userID string) ([]domain.WorkRequest, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomPengajuan+` FROM pengajuan WHERE pengguna_id = ? ORDER BY dibuat_pada DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.WorkRequest{}
	for rows.Next() {
		x, err := pindaiPengajuan(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *x)
	}
	return hasil, rows.Err()
}

func (r *PengajuanRepo) ByID(ctx context.Context, id string) (*domain.WorkRequest, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+kolomPengajuan+` FROM pengajuan WHERE id = ? LIMIT 1`, id)
	x, err := pindaiPengajuan(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrTidakDitemukan
	}
	return x, err
}

func (r *PengajuanRepo) List(ctx context.Context, status *domain.RequestStatus) ([]domain.WorkRequest, error) {
	q := `SELECT ` + kolomPengajuan + ` FROM pengajuan`
	args := []any{}
	if status != nil && *status != "" {
		q += ` WHERE status = ?`
		args = append(args, *status)
	}
	q += ` ORDER BY dibuat_pada DESC`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.WorkRequest{}
	for rows.Next() {
		x, err := pindaiPengajuan(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *x)
	}
	return hasil, rows.Err()
}

func (r *PengajuanRepo) Create(ctx context.Context, x *domain.WorkRequest) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO pengajuan
		(id, jenis, pengguna_id, nama_pengguna, mulai, selesai, alasan, status, dibuat_pada, batch_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, argPengajuan(x)...)
	return err
}

// CreateMany: seluruh baris satu batch masuk lewat SATU transaksi — bila ada
// satu baris gagal, tidak ada perangkat yang tercatat cuti separuh batch.
func (r *PengajuanRepo) CreateMany(ctx context.Context, rs []*domain.WorkRequest) error {
	if len(rs) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO pengajuan
		(id, jenis, pengguna_id, nama_pengguna, mulai, selesai, alasan, status, dibuat_pada, batch_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, x := range rs {
		if _, err := stmt.ExecContext(ctx, argPengajuan(x)...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// argPengajuan: nilai kolom satu pengajuan, urutannya tetap sama dengan
// pernyataan INSERT di atas.
func argPengajuan(x *domain.WorkRequest) []any {
	mulai, _ := time.Parse("2006-01-02", x.StartDate)
	selesai, _ := time.Parse("2006-01-02", x.EndDate)
	dibuat, _ := time.Parse(time.RFC3339Nano, x.CreatedAt)
	return []any{x.ID, x.Type, x.UserID, x.UserName, mulai, selesai, x.Reason,
		x.Status, dibuat.UTC(), nullKosong(x.BatchID)}
}

// nullKosong: batch_id kosong disimpan sebagai NULL, bukan string kosong —
// supaya pengajuan tunggal tidak pernah tampak sebagai bagian dari batch.
func nullKosong(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.TrimSpace(s)
}

func (r *PengajuanRepo) Putuskan(ctx context.Context, id string, status domain.RequestStatus, oleh, catatan string, now time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE pengajuan SET status = ?, diputus_pada = ?, diputus_oleh = ?, catatan_keputusan = ? WHERE id = ?`,
		status, now.UTC(), oleh, catatan, id)
	return err
}

// DisetujuiMenggulung: pengajuan disetujui yang rentangnya menggulung tanggal.
func (r *PengajuanRepo) DisetujuiMenggulung(ctx context.Context, tanggal string) ([]domain.WorkRequest, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomPengajuan+` FROM pengajuan
		 WHERE status = 'DISETUJUI' AND mulai <= ? AND selesai >= ?`, tanggal, tanggal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.WorkRequest{}
	for rows.Next() {
		x, err := pindaiPengajuan(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *x)
	}
	return hasil, rows.Err()
}

// DisetujuiRentang: pengajuan disetujui yang rentangnya bersinggungan dengan
// [dari, sampai] — termasuk yang mulai sebelum atau berakhir setelah rentang,
// karena hari di dalam rentang tetap tercakup.
func (r *PengajuanRepo) DisetujuiRentang(ctx context.Context, dari, sampai string) ([]domain.WorkRequest, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomPengajuan+` FROM pengajuan
		 WHERE status = 'DISETUJUI' AND mulai <= ? AND selesai >= ?
		 ORDER BY mulai`, sampai, dari)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.WorkRequest{}
	for rows.Next() {
		x, err := pindaiPengajuan(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *x)
	}
	return hasil, rows.Err()
}
