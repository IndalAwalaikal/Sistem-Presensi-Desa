package mysql

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

var _ port.UserRepo = (*UserRepo)(nil)

type UserRepo struct{ db *sql.DB }

func UserRepoBaru(db *sql.DB) *UserRepo { return &UserRepo{db: db} }

const kolomPengguna = `id, nama_lengkap, email, hash_sandi, peran, status_akun, status_biometrik,
	persetujuan_wajah_pada, nip, jabatan, unit, telepon, alamat, foto_url, dibuat_pada, diubah_pada`

func pindaiPengguna(scan func(...any) error) (*domain.PenggunaInternal, error) {
	var (
		u              domain.PenggunaInternal
		hash           sql.NullString
		persetujuan    sql.NullTime
		foto           sql.NullString
		dibuat, diubah time.Time
	)
	if err := scan(&u.ID, &u.FullName, &u.Email, &hash, &u.Role, &u.AccountStatus,
		&u.BiometricStatus, &persetujuan, &u.Official.EmployeeID, &u.Official.Position,
		&u.Official.Unit, &u.Official.PhoneNumber, &u.Official.Address, &foto,
		&dibuat, &diubah); err != nil {
		return nil, err
	}
	if hash.Valid {
		h := hash.String
		u.HashSandi = &h
	}
	if persetujuan.Valid {
		s := domain.WaktuISO(persetujuan.Time)
		u.BiometricConsentAt = &s
	}
	if foto.Valid {
		f := foto.String
		u.PhotoURL = &f
	}
	// Tanggal (WITA) akun dibuat — bahan rekap agar hari kerja sebelum akun ada
	// tidak dihitung "tanpa keterangan".
	u.DibuatPada = domain.TanggalISO(dibuat)
	return &u, nil
}

func (r *UserRepo) ByEmail(ctx context.Context, email string) (*domain.PenggunaInternal, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+kolomPengguna+` FROM pengguna WHERE email = ? LIMIT 1`, email)
	u, err := pindaiPengguna(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrTidakDitemukan
	}
	return u, err
}

func (r *UserRepo) ByID(ctx context.Context, id string) (*domain.PenggunaInternal, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+kolomPengguna+` FROM pengguna WHERE id = ? LIMIT 1`, id)
	u, err := pindaiPengguna(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrTidakDitemukan
	}
	return u, err
}

func (r *UserRepo) List(ctx context.Context) ([]domain.PenggunaInternal, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+kolomPengguna+` FROM pengguna ORDER BY nama_lengkap`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hasil := []domain.PenggunaInternal{}
	for rows.Next() {
		u, err := pindaiPengguna(rows.Scan)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *u)
	}
	return hasil, rows.Err()
}

func (r *UserRepo) Create(ctx context.Context, u *domain.PenggunaInternal) error {
	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx, `INSERT INTO pengguna
		(id, nama_lengkap, email, hash_sandi, peran, status_akun, status_biometrik,
		 persetujuan_wajah_pada, nip, jabatan, unit, telepon, alamat, foto_url,
		 dibuat_pada, diubah_pada)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.FullName, u.Email, nullStr(u.HashSandi), u.Role, u.AccountStatus,
		u.BiometricStatus, nullTimeP(u.BiometricConsentAt), u.Official.EmployeeID,
		u.Official.Position, u.Official.Unit, u.Official.PhoneNumber, u.Official.Address,
		nullStr(u.PhotoURL), now, now)
	if err != nil {
		return domain.GalatBentrokDariDB(err, "Email atau NIP/NIK sudah terdaftar.")
	}
	return nil
}

func (r *UserRepo) UpdateStatus(ctx context.Context, id string, status domain.AccountStatus) error {
	if status == domain.Aktif {
		_, err := r.db.ExecContext(ctx,
			`UPDATE pengguna SET status_akun = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`, status, id)
		return err
	}
	return r.nonaktifkanDenganPembersihan(ctx, id, status, nil, false)
}

func (r *UserRepo) UpdateSandiStatus(ctx context.Context, id string, hash *string, status domain.AccountStatus) error {
	if status == domain.Aktif {
		_, err := r.db.ExecContext(ctx,
			`UPDATE pengguna SET hash_sandi = ?, status_akun = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`,
			nullStr(hash), status, id)
		return err
	}
	return r.nonaktifkanDenganPembersihan(ctx, id, status, hash, true)
}

// nonaktifkanDenganPembersihan: status akun, status biometrik, dan penghapusan
// template/foto wajah ditulis dalam satu transaksi. Akun yang harus diaktivasi
// ulang perlu enrollment wajah baru; salinan foto enrollment tidak ikut hidup
// kembali saat akun diaktifkan.
func (r *UserRepo) nonaktifkanDenganPembersihan(ctx context.Context, id string, status domain.AccountStatus, hash *string, ubahSandi bool) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	query := `UPDATE pengguna SET status_akun = ?, status_biometrik = 'NOT_ENROLLED',
	 diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`
	args := []any{status, id}
	if ubahSandi {
		query = `UPDATE pengguna SET hash_sandi = ?, status_akun = ?, status_biometrik = 'NOT_ENROLLED',
		 diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`
		args = []any{nullStr(hash), status, id}
	}
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE enrollment SET foto = JSON_ARRAY(), embedding = NULL,
		 diubah_pada = UTC_TIMESTAMP(3) WHERE pengguna_id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *UserRepo) UpdateBiometrik(ctx context.Context, id string, status domain.BiometricStatus) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE pengguna SET status_biometrik = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`, status, id)
	return err
}

func (r *UserRepo) UpdateKontak(ctx context.Context, id, telepon, alamat string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE pengguna SET telepon = ?, alamat = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`,
		telepon, alamat, id)
	return err
}

// UpdateSandi: hanya hash_sandi yang berubah — status akun tidak ikut tersentuh
// (berbeda dengan UpdateSandiStatus yang dipakai saat aktivasi/reset).
func (r *UserRepo) UpdateSandi(ctx context.Context, id, hash string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE pengguna SET hash_sandi = ?, diubah_pada = UTC_TIMESTAMP(3) WHERE id = ?`, hash, id)
	return err
}

func nullStr(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

func nullTimeP(iso *string) any {
	if iso == nil {
		return nil
	}
	t, err := time.Parse(time.RFC3339Nano, *iso)
	if err != nil {
		return nil
	}
	return t.UTC()
}
