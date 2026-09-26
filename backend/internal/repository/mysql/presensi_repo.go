package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.PresensiRepo = (*PresensiRepo)(nil)

type PresensiRepo struct{ db *sql.DB }

func PresensiRepoBaru(db *sql.DB) *PresensiRepo { return &PresensiRepo{db: db} }

const kolomPresensi = `p.id, p.pengguna_id, p.jenis, p.mode, p.status, p.kantor_id,
	p.cocok_wajah, p.skor_wajah, p.hidup, p.skor_liveness, p.vonis_geofence, p.jarak_meter,
	p.akurasi_meter, p.waktu_server, p.selisih_menit`

const dariPresensi = ` FROM presensi p JOIN pengguna u ON u.id = p.pengguna_id `

func pindaiPresensi(scan func(...any) error) (*domain.Attendance, error) {
	var (
		a        domain.Attendance
		waktu    time.Time
		namaUser string
	)
	if err := scan(&a.ID, &a.UserID, &a.Type, &a.Mode, &a.Status, &a.Office.ID,
		&a.Verification.FaceMatch, &a.Verification.FaceScore, &a.Verification.Liveness,
		&a.Verification.LivenessScore, &a.Verification.Geofence.Verdict,
		&a.Verification.Geofence.DistanceMeters, &a.Verification.Geofence.AccuracyMeters,
		&waktu, &a.SelisihMenit, &namaUser); err != nil {
		return nil, err
	}
	a.UserName = namaUser
	a.Verification.ServerTime = domain.WaktuISO(waktu)
	return &a, nil
}

func (r *PresensiRepo) SudahPresensi(ctx context.Context, userID, tanggal string) ([]domain.AttendanceType, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT jenis FROM presensi WHERE pengguna_id = ? AND tanggal = ?`, userID, tanggal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.AttendanceType{}
	for rows.Next() {
		var t domain.AttendanceType
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		hasil = append(hasil, t)
	}
	return hasil, rows.Err()
}

func (r *PresensiRepo) HariIni(ctx context.Context, userID, tanggal string) ([]domain.Attendance, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomPresensi+`, u.nama_lengkap`+dariPresensi+
			` WHERE p.pengguna_id = ? AND p.tanggal = ? ORDER BY p.waktu_server`, userID, tanggal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.Attendance{}
	for rows.Next() {
		a, err := pindaiPresensi(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *a)
	}
	return hasil, rows.Err()
}

func (r *PresensiRepo) Rentang(ctx context.Context, userID, dari, sampai string, status *domain.AttendanceStatus) ([]domain.Attendance, error) {
	q := `SELECT ` + kolomPresensi + `, u.nama_lengkap` + dariPresensi + ` WHERE p.pengguna_id = ?`
	args := []any{userID}
	if dari != "" {
		q += ` AND p.tanggal >= ?`
		args = append(args, dari)
	}
	if sampai != "" {
		q += ` AND p.tanggal <= ?`
		args = append(args, sampai)
	}
	if status != nil && *status != "" {
		q += ` AND p.status = ?`
		args = append(args, *status)
	}
	q += ` ORDER BY p.waktu_server DESC`
	return r.daftar(ctx, q, args...)
}

func (r *PresensiRepo) Tanggal(ctx context.Context, tanggal string) ([]domain.Attendance, error) {
	q := `SELECT ` + kolomPresensi + `, u.nama_lengkap` + dariPresensi +
		` WHERE p.tanggal = ? ORDER BY p.waktu_server DESC`
	return r.daftar(ctx, q, tanggal)
}

func (r *PresensiRepo) daftar(ctx context.Context, q string, args ...any) ([]domain.Attendance, error) {
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.Attendance{}
	for rows.Next() {
		a, err := pindaiPresensi(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *a)
	}
	return hasil, rows.Err()
}

func (r *PresensiRepo) Create(ctx context.Context, a *domain.Attendance) error {
	waktu, err := time.Parse(time.RFC3339Nano, a.Verification.ServerTime)
	if err != nil {
		return fmt.Errorf("waktu server tidak sah: %w", err)
	}
	tanggal := domain.TanggalISO(waktu)
	_, err = r.db.ExecContext(ctx, `INSERT INTO presensi
		(id, pengguna_id, jenis, mode, status, kantor_id, cocok_wajah, skor_wajah,
		 hidup, skor_liveness, vonis_geofence, jarak_meter, akurasi_meter,
		 waktu_server, selisih_menit, tanggal, dibuat_pada)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
		a.ID, a.UserID, a.Type, a.Mode, a.Status, a.Office.ID,
		a.Verification.FaceMatch, a.Verification.FaceScore, a.Verification.Liveness,
		a.Verification.LivenessScore, a.Verification.Geofence.Verdict,
		a.Verification.Geofence.DistanceMeters, a.Verification.Geofence.AccuracyMeters,
		waktu.UTC(), a.SelisihMenit, tanggal)
	return err
}

// HariHadirRentang: himpunan tanggal (ISO) yang punya presensi masuk per pengguna
// dalam rentang inklusif. Hanya jenis CHECK_IN yang dihitung — presensi pulang
// tidak menentukan apakah seseorang masuk kerja.
func (r *PresensiRepo) HariHadirRentang(ctx context.Context, dari, sampai string) (map[string]map[string]bool, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT pengguna_id, DATE_FORMAT(tanggal, '%Y-%m-%d') FROM presensi
		 WHERE jenis = 'CHECK_IN' AND tanggal BETWEEN ? AND ?
		 ORDER BY tanggal`, dari, sampai)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := map[string]map[string]bool{}
	for rows.Next() {
		var id, tanggal string
		if err := rows.Scan(&id, &tanggal); err != nil {
			return nil, err
		}
		if hasil[id] == nil {
			hasil[id] = map[string]bool{}
		}
		hasil[id][tanggal] = true
	}
	return hasil, rows.Err()
}

// TransaksiRentang: seluruh transaksi presensi (semua pengguna) pada rentang
// tanggal inklusif — bahan hitung durasi "lambat berapa menit" dan "pulang cepat
// berapa menit" pada rekap bulanan. Yang dibawa adalah transaksi apa adanya
// (jenis, status, waktu server); selisih menitnya dihitung di domain agar
// aturannya tidak digandakan di SQL.
func (r *PresensiRepo) TransaksiRentang(ctx context.Context, dari, sampai string) ([]domain.Attendance, error) {
	q := `SELECT ` + kolomPresensi + `, u.nama_lengkap` + dariPresensi +
		` WHERE p.tanggal BETWEEN ? AND ? ORDER BY p.waktu_server`
	return r.daftar(ctx, q, dari, sampai)
}

// RekapBulan: hadir (jumlah CHECK_IN) & terlambat per pengguna dalam satu
// bulan; kunci peta = pengguna_id.
func (r *PresensiRepo) RekapBulan(ctx context.Context, tahun, bulan int) (map[string]domain.RekapBulanan, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT pengguna_id,
			SUM(CASE WHEN jenis = 'CHECK_IN' THEN 1 ELSE 0 END) AS hadir,
			SUM(CASE WHEN jenis = 'CHECK_IN' AND status = 'TERLAMBAT' THEN 1 ELSE 0 END) AS terlambat
		 FROM presensi
		 WHERE YEAR(tanggal) = ? AND MONTH(tanggal) = ?
		 GROUP BY pengguna_id`, tahun, bulan)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := map[string]domain.RekapBulanan{}
	for rows.Next() {
		var id string
		var rbd domain.RekapBulanan
		if err := rows.Scan(&id, &rbd.Hadir, &rbd.Terlambat); err != nil {
			return nil, err
		}
		hasil[id] = rbd
	}
	return hasil, rows.Err()
}
