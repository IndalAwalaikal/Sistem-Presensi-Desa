package mysql

import (
	"context"
	"database/sql"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.JadwalKhususRepo = (*JadwalKhususRepo)(nil)

type JadwalKhususRepo struct{ db *sql.DB }

func JadwalKhususRepoBaru(db *sql.DB) *JadwalKhususRepo {
	return &JadwalKhususRepo{db: db}
}

func (r *JadwalKhususRepo) List(ctx context.Context) ([]domain.JadwalKhusus, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, nama, DATE_FORMAT(mulai, '%Y-%m-%d'), DATE_FORMAT(selesai, '%Y-%m-%d'),
		 TIME_FORMAT(jam_masuk, '%H:%i'), TIME_FORMAT(batas_masuk, '%H:%i'),
		 TIME_FORMAT(jam_pulang, '%H:%i'), TIME_FORMAT(batas_pulang, '%H:%i'),
		 hari_kerja, dibuat_oleh, dibuat_pada
		 FROM jadwal_khusus ORDER BY mulai DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Kontrak API daftar selalu array JSON (termasuk saat tabel masih kosong),
	// bukan null yang membuat komponen admin gagal saat membaca .length.
	hasil := []domain.JadwalKhusus{}
	for rows.Next() {
		var jk domain.JadwalKhusus
		var hariCSV string
		var dibuatPada time.Time
		if err := rows.Scan(&jk.ID, &jk.Name, &jk.StartDate, &jk.EndDate,
			&jk.CheckInStart, &jk.CheckInDeadline, &jk.CheckOutStart, &jk.CheckOutEnd,
			&hariCSV, &jk.CreatedBy, &dibuatPada); err != nil {
			return nil, err
		}
		jk.WorkDays = csvHari(hariCSV)
		jk.CreatedAt = domain.WaktuISO(dibuatPada)
		hasil = append(hasil, jk)
	}
	return hasil, rows.Err()
}

func (r *JadwalKhususRepo) AktifPada(ctx context.Context, tanggal string) (*domain.JadwalKhusus, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, nama, DATE_FORMAT(mulai, '%Y-%m-%d'), DATE_FORMAT(selesai, '%Y-%m-%d'),
		 TIME_FORMAT(jam_masuk, '%H:%i'), TIME_FORMAT(batas_masuk, '%H:%i'),
		 TIME_FORMAT(jam_pulang, '%H:%i'), TIME_FORMAT(batas_pulang, '%H:%i'),
		 hari_kerja, dibuat_oleh, dibuat_pada
		 FROM jadwal_khusus WHERE ? BETWEEN mulai AND selesai ORDER BY dibuat_pada DESC LIMIT 1`, tanggal)
	var jk domain.JadwalKhusus
	var hariCSV string
	var dibuatPada time.Time
	if err := row.Scan(&jk.ID, &jk.Name, &jk.StartDate, &jk.EndDate,
		&jk.CheckInStart, &jk.CheckInDeadline, &jk.CheckOutStart, &jk.CheckOutEnd,
		&hariCSV, &jk.CreatedBy, &dibuatPada); err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrTidakDitemukan
		}
		return nil, err
	}
	jk.WorkDays = csvHari(hariCSV)
	jk.CreatedAt = domain.WaktuISO(dibuatPada)
	return &jk, nil
}

func (r *JadwalKhususRepo) Simpan(ctx context.Context, jk domain.JadwalKhusus) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO jadwal_khusus (id, nama, mulai, selesai, jam_masuk, batas_masuk, jam_pulang, batas_pulang, hari_kerja, dibuat_oleh, dibuat_pada)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
		 ON DUPLICATE KEY UPDATE nama = VALUES(nama), mulai = VALUES(mulai), selesai = VALUES(selesai),
		 jam_masuk = VALUES(jam_masuk), batas_masuk = VALUES(batas_masuk), jam_pulang = VALUES(jam_pulang),
		 batas_pulang = VALUES(batas_pulang), hari_kerja = VALUES(hari_kerja)`,
		jk.ID, jk.Name, jk.StartDate, jk.EndDate,
		jk.CheckInStart+":00", jk.CheckInDeadline+":00",
		jk.CheckOutStart+":00", jk.CheckOutEnd+":00",
		csvHariBalik(jk.WorkDays), jk.CreatedBy)
	return err
}

func (r *JadwalKhususRepo) Hapus(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM jadwal_khusus WHERE id = ?`, id)
	return err
}
