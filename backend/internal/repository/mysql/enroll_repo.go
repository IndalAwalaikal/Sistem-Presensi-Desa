package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.EnrollRepo = (*EnrollRepo)(nil)

type EnrollRepo struct{ db *sql.DB }

func EnrollRepoBaru(db *sql.DB) *EnrollRepo { return &EnrollRepo{db: db} }

const kolomEnrollment = `e.id, e.pengguna_id, e.status, e.foto, e.dikirim_pada, e.diputus_pada, e.catatan_review, u.nama_lengkap`

func pindaiEnrollment(scan func(...any) error) (*domain.FaceEnrollment, error) {
	var (
		e       domain.FaceEnrollment
		fotoRaw []byte
		dikirim sql.NullTime
		diputus sql.NullTime
		catatan sql.NullString
		nama    string
	)
	if err := scan(&e.ID, &e.UserID, &e.Status, &fotoRaw, &dikirim, &diputus, &catatan, &nama); err != nil {
		return nil, err
	}
	e.UserName = nama
	if err := json.Unmarshal(fotoRaw, &e.Photos); err != nil {
		return nil, fmt.Errorf("foto enrollment rusak: %w", err)
	}
	if dikirim.Valid {
		s := domain.WaktuISO(dikirim.Time)
		e.SubmittedAt = &s
	}
	if diputus.Valid {
		s := domain.WaktuISO(diputus.Time)
		e.ReviewedAt = &s
	}
	if catatan.Valid {
		s := catatan.String
		e.ReviewerNote = &s
	}
	return &e, nil
}

func (r *EnrollRepo) ByUserTerbaru(ctx context.Context, userID string) (*domain.FaceEnrollment, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+kolomEnrollment+` FROM enrollment e JOIN pengguna u ON u.id = e.pengguna_id
		 WHERE e.pengguna_id = ? ORDER BY e.dibuat_pada DESC LIMIT 1`, userID)
	e, err := pindaiEnrollment(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrTidakDitemukan
	}
	return e, err
}

func (r *EnrollRepo) ByID(ctx context.Context, id string) (*domain.FaceEnrollment, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+kolomEnrollment+` FROM enrollment e JOIN pengguna u ON u.id = e.pengguna_id
		 WHERE e.id = ? LIMIT 1`, id)
	e, err := pindaiEnrollment(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrTidakDitemukan
	}
	return e, err
}

func (r *EnrollRepo) Pending(ctx context.Context) ([]domain.FaceEnrollment, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomEnrollment+` FROM enrollment e JOIN pengguna u ON u.id = e.pengguna_id
		 WHERE e.status = 'SUBMITTED' ORDER BY e.dikirim_pada ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.FaceEnrollment{}
	for rows.Next() {
		e, err := pindaiEnrollment(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *e)
	}
	return hasil, rows.Err()
}

// Embedding: vektor wajah referensi dari enrollment terbaru pengguna —
// tidak pernah dikirim ke frontend, hanya dipakai verifikasi server.
func (r *EnrollRepo) Embedding(ctx context.Context, userID string) ([]float64, error) {
	var raw []byte
	err := r.db.QueryRowContext(ctx,
		`SELECT embedding FROM enrollment WHERE pengguna_id = ? AND status = 'APPROVED'
		 ORDER BY dibuat_pada DESC LIMIT 1`, userID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	emb := []float64{}
	if err := json.Unmarshal(raw, &emb); err != nil {
		return nil, err
	}
	return emb, nil
}

func (r *EnrollRepo) Create(ctx context.Context, e *domain.FaceEnrollment, embedding []float64) error {
	foto, err := json.Marshal(e.Photos)
	if err != nil {
		return err
	}
	var embRaw any
	if embedding != nil {
		embRaw, err = json.Marshal(embedding)
		if err != nil {
			return err
		}
	}
	now := time.Now().UTC()
	dikirim := any(nil)
	if e.SubmittedAt != nil {
		t, err := time.Parse(time.RFC3339Nano, *e.SubmittedAt)
		if err != nil {
			return err
		}
		dikirim = t.UTC()
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO enrollment
		(id, pengguna_id, status, foto, embedding, dikirim_pada, diputus_pada, catatan_review, dibuat_pada, diubah_pada)
		VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
		e.ID, e.UserID, e.Status, foto, embRaw, dikirim, now, now)
	return err
}

func (r *EnrollRepo) Putuskan(ctx context.Context, id string, status domain.EnrollmentStatus, catatan string, now time.Time) error {
	_, err := r.db.ExecContext(ctx,
		// Foto mentah hanya diperlukan selama peninjauan. Setelah diputuskan,
		// hapus foto dan pertahankan embedding hanya untuk enrollment disetujui.
		`UPDATE enrollment SET status = ?, foto = JSON_ARRAY(),
		 embedding = CASE WHEN ? = 'APPROVED' THEN embedding ELSE NULL END,
		 diputus_pada = ?, catatan_review = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`,
		status, status, now.UTC(), catatan, id)
	return err
}
