package mysql

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.KonfigRepo = (*KonfigRepo)(nil)

type KonfigRepo struct{ db *sql.DB }

func KonfigRepoBaru(db *sql.DB) *KonfigRepo { return &KonfigRepo{db: db} }

// Ambil: kantor + jadwal + akurasi maksimum dalam satu pembacaan.
func (r *KonfigRepo) Ambil(ctx context.Context) (*domain.KonfigurasiAktif, error) {
	var (
		kantorID, kantorNama                   string
		lat, lng                               float64
		radius, akurasiMaks                    int
		schedID, nama                          string
		masuk, batasMasuk, pulang, batasPulang string
		hariCSV                                string
	)
	err := r.db.QueryRowContext(ctx,
		`SELECT k.id, k.nama, k.latitude, k.longitude, k.radius_meter, c.akurasi_maks_m
		 FROM kantor k CROSS JOIN konfigurasi c WHERE c.id = 1 LIMIT 1`).
		Scan(&kantorID, &kantorNama, &lat, &lng, &radius, &akurasiMaks)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrTidakDitemukan
		}
		return nil, err
	}
	err = r.db.QueryRowContext(ctx,
		`SELECT id, nama, TIME_FORMAT(jam_masuk, '%H:%i'), TIME_FORMAT(batas_masuk, '%H:%i'),
		 TIME_FORMAT(jam_pulang, '%H:%i'), TIME_FORMAT(batas_pulang, '%H:%i'), hari_kerja
		 FROM jadwal WHERE id = 1`).Scan(&schedID, &nama, &masuk, &batasMasuk, &pulang, &batasPulang, &hariCSV)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrTidakDitemukan
		}
		return nil, err
	}

	return &domain.KonfigurasiAktif{
		Office: domain.OfficeLocation{
			ID:           kantorID,
			Name:         kantorNama,
			Point:        domain.GeoPoint{Latitude: lat, Longitude: lng},
			RadiusMeters: radius,
		},
		Schedule: domain.WorkSchedule{
			ID:              schedID,
			Name:            nama,
			CheckInStart:    masuk,
			CheckInDeadline: batasMasuk,
			CheckOutStart:   pulang,
			CheckOutEnd:     batasPulang,
			WorkDays:        csvHari(hariCSV),
		},
		MaxAccuracyMeters: akurasiMaks,
	}, nil
}

// SimpanJadwal: perbarui baris jadwal aktif (id = 1).
func (r *KonfigRepo) SimpanJadwal(ctx context.Context, j *domain.WorkSchedule) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE jadwal SET nama = ?, jam_masuk = ?, batas_masuk = ?, jam_pulang = ?,
		 batas_pulang = ?, hari_kerja = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = 1`,
		j.Name, j.CheckInStart+":00", j.CheckInDeadline+":00",
		j.CheckOutStart+":00", j.CheckOutEnd+":00", csvHariBalik(j.WorkDays))
	return err
}

// SimpanKantor: perbarui titik & radius kantor yang berlaku (baris tunggal).
func (r *KonfigRepo) SimpanKantor(ctx context.Context, k *domain.OfficeLocation) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE kantor SET nama = ?, latitude = ?, longitude = ?, radius_meter = ? WHERE id = ?`,
		k.Name, k.Point.Latitude, k.Point.Longitude, k.RadiusMeters, k.ID)
	return err
}

func csvHari(csv string) []int {
	bagian := strings.Split(csv, ",")
	hasil := make([]int, 0, len(bagian))
	for _, s := range bagian {
		n, err := strconv.Atoi(strings.TrimSpace(s))
		if err == nil {
			hasil = append(hasil, n)
		}
	}
	return hasil
}

func csvHariBalik(hari []int) string {
	bagian := make([]string, 0, len(hari))
	for _, h := range hari {
		bagian = append(bagian, strconv.Itoa(h))
	}
	return strings.Join(bagian, ",")
}
