package usecase

import (
	"context"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// AuditUsecase: membaca jejak audit untuk pengelola akun.
type AuditUsecase struct {
	audit port.AuditRepo
}

func AuditBaru(a port.AuditRepo) *AuditUsecase { return &AuditUsecase{audit: a} }

// DaftarAudit: log audit terbaru.
func (uc *AuditUsecase) DaftarAudit(ctx context.Context, aktor *domain.User) ([]domain.AuditLog, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	return uc.audit.List(ctx)
}
