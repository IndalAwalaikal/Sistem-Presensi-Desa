package mysql

import (
	"context"
	"database/sql"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.AuditRepo = (*AuditRepo)(nil)

type AuditRepo struct{ db *sql.DB }

func AuditRepoBaru(db *sql.DB) *AuditRepo { return &AuditRepo{db: db} }

func (r *AuditRepo) Create(ctx context.Context, log domain.AuditLog) error {
	pada, err := time.Parse(time.RFC3339Nano, log.At)
	if err != nil {
		pada = time.Now().UTC()
	}
	_, err = r.db.ExecContext(ctx, `INSERT INTO audit
		(id, pada, aktor_id, aktor_nama, aksi, sasaran_jenis, sasaran_id, detail)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		log.ID, pada.UTC(), log.ActorID, log.ActorName, log.Action,
		log.TargetType, log.TargetID, log.Detail)
	return err
}

func (r *AuditRepo) List(ctx context.Context) ([]domain.AuditLog, error) {
	// Batas 200 baris: cukup untuk jejak audit terbaru dan aman dari
	// "Out of sort memory" (MySQL 1062/1038) pada sort_buffer kecil —
	// pengurutan memakai indeks idx_audit_pada(pada).
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, pada, aktor_id, aktor_nama, aksi, sasaran_jenis, sasaran_id, detail
		 FROM audit ORDER BY pada DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.AuditLog{}
	for rows.Next() {
		var l domain.AuditLog
		var pada time.Time
		if err := rows.Scan(&l.ID, &pada, &l.ActorID, &l.ActorName, &l.Action,
			&l.TargetType, &l.TargetID, &l.Detail); err != nil {
			return nil, err
		}
		l.At = domain.WaktuISO(pada)
		hasil = append(hasil, l)
	}
	return hasil, rows.Err()
}
