package tests

import (
	"context"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// ---------------------------------------------------------------------
// Stub repositori — menguji lapisan HTTP tanpa MySQL.
// ---------------------------------------------------------------------

type stubUsers struct {
	data map[string]*domain.PenggunaInternal // kunci: email
	byID map[string]*domain.PenggunaInternal
}

func (s *stubUsers) ByEmail(_ context.Context, email string) (*domain.PenggunaInternal, error) {
	u, ada := s.data[strings.ToLower(email)]
	if !ada {
		return nil, domain.ErrTidakDitemukan
	}
	return u, nil
}

func (s *stubUsers) ByID(_ context.Context, id string) (*domain.PenggunaInternal, error) {
	u, ada := s.byID[id]
	if !ada {
		return nil, domain.ErrTidakDitemukan
	}
	return u, nil
}

func (s *stubUsers) List(_ context.Context) ([]domain.PenggunaInternal, error) {
	out := []domain.PenggunaInternal{}
	for _, u := range s.byID {
		out = append(out, *u)
	}
	return out, nil
}

func (s *stubUsers) Create(_ context.Context, u *domain.PenggunaInternal) error {
	s.data[u.Email] = u
	s.byID[u.ID] = u
	return nil
}

func (s *stubUsers) UpdateStatus(_ context.Context, id string, st domain.AccountStatus) error {
	s.byID[id].AccountStatus = st
	return nil
}

func (s *stubUsers) UpdateSandiStatus(_ context.Context, id string, hash *string, st domain.AccountStatus) error {
	u := s.byID[id]
	u.HashSandi = hash
	u.AccountStatus = st
	return nil
}

func (s *stubUsers) UpdateBiometrik(_ context.Context, id string, st domain.BiometricStatus) error {
	s.byID[id].BiometricStatus = st
	return nil
}

func (s *stubUsers) UpdateKontak(_ context.Context, id, telepon, alamat string) error {
	u, ada := s.byID[id]
	if !ada {
		return domain.ErrTidakDitemukan
	}
	u.Official.PhoneNumber = telepon
	u.Official.Address = alamat
	return nil
}

func (s *stubUsers) UpdateSandi(_ context.Context, id, hash string) error {
	u, ada := s.byID[id]
	if !ada {
		return domain.ErrTidakDitemukan
	}
	h := hash
	u.HashSandi = &h
	return nil
}

type stubUndangan struct{ data map[string]*domain.Undangan }

func (s *stubUndangan) ByKode(_ context.Context, kode string) (*domain.Undangan, error) {
	u, ada := s.data[kode]
	if !ada {
		return nil, domain.ErrTidakDitemukan
	}
	return u, nil
}

func (s *stubUndangan) Create(_ context.Context, u *domain.Undangan) error {
	s.data[u.Kode] = u
	return nil
}

func (s *stubUndangan) List(_ context.Context) ([]domain.Undangan, error) { return nil, nil }

func (s *stubUndangan) GugurkanBelumDipakai(_ context.Context, _ string) error { return nil }

// stubAktivasi: meniru transaksi aktivasi. Urutannya sengaja sama dengan
// implementasi MySQL — kunci kode lebih dahulu, baru ubah akun — supaya uji HTTP
// juga menangkap regresi "akun aktif tanpa kode terkunci".
type stubAktivasi struct {
	users    *stubUsers
	undangan *stubUndangan
}

func (s *stubAktivasi) Aktivasi(_ context.Context, p domain.PerintahAktivasi) error {
	u := s.undangan.data[p.Kode]
	if u == nil {
		return domain.ErrKodeSalah
	}
	if u.DipakaiPada != nil {
		return domain.ErrKodeTerpakai
	}
	dipakai := domain.WaktuISO(p.Sekarang)
	u.DipakaiPada = &dipakai

	us := s.users.byID[p.UserID]
	if us == nil {
		return domain.ErrTidakDitemukan
	}
	hash := p.HashSandi
	us.HashSandi = &hash
	us.AccountStatus = domain.Aktif
	us.Official.PhoneNumber = p.Telepon
	us.Official.Address = p.Alamat
	persetujuan := domain.WaktuISO(p.Persetujuan)
	us.BiometricConsentAt = &persetujuan
	return nil
}

var _ port.AktivasiRepo = (*stubAktivasi)(nil)

type stubToken struct{ dicabut map[string]bool }

func (s *stubToken) Revoke(_ context.Context, jti string, _ time.Time) error {
	s.dicabut[jti] = true
	return nil
}
func (s *stubToken) Revoked(_ context.Context, jti string) (bool, error) { return s.dicabut[jti], nil }
func (s *stubToken) Bersihkan(_ context.Context) error                   { return nil }

type stubAudit struct{ logs []domain.AuditLog }

func (s *stubAudit) Create(_ context.Context, l domain.AuditLog) error {
	s.logs = append(s.logs, l)
	return nil
}
func (s *stubAudit) List(_ context.Context) ([]domain.AuditLog, error) { return s.logs, nil }

var (
	_ port.UserRepo     = (*stubUsers)(nil)
	_ port.UndanganRepo = (*stubUndangan)(nil)
	_ port.TokenRepo    = (*stubToken)(nil)
	_ port.AuditRepo    = (*stubAudit)(nil)
)

// ---------------------------------------------------------------------
// Stub laporan: presensi, pengajuan, dan konfigurasi seperlunya —
// cukup untuk menguji rekap "tanpa keterangan" lewat HTTP.
// ---------------------------------------------------------------------

type stubPresensi struct {
	// rekap: kunci pengguna_id → jumlah CHECK_IN & TERLAMBAT dalam bulan.
	rekap map[string]domain.RekapBulanan
	// hadir: kunci pengguna_id → himpunan tanggal (ISO) berpresensi masuk.
	hadir map[string]map[string]bool
	// transaksi: seluruh transaksi bulan itu — bahan hitung durasi
	// "lambat berapa menit" / "pulang cepat berapa menit".
	transaksi []domain.Attendance
}

func (s *stubPresensi) SudahPresensi(context.Context, string, string) ([]domain.AttendanceType, error) {
	return nil, nil
}
func (s *stubPresensi) HariIni(context.Context, string, string) ([]domain.Attendance, error) {
	return nil, nil
}
func (s *stubPresensi) Rentang(context.Context, string, string, string, *domain.AttendanceStatus) ([]domain.Attendance, error) {
	return nil, nil
}
func (s *stubPresensi) Tanggal(context.Context, string) ([]domain.Attendance, error) { return nil, nil }
func (s *stubPresensi) Create(context.Context, *domain.Attendance) error             { return nil }
func (s *stubPresensi) RekapBulan(context.Context, int, int) (map[string]domain.RekapBulanan, error) {
	return s.rekap, nil
}
func (s *stubPresensi) HariHadirRentang(context.Context, string, string) (map[string]map[string]bool, error) {
	return s.hadir, nil
}
func (s *stubPresensi) TransaksiRentang(context.Context, string, string) ([]domain.Attendance, error) {
	return s.transaksi, nil
}

type stubPengajuan struct {
	// rentang: pengajuan disetujui yang bersinggungan dengan rentang rekap —
	// sumber angka izin/sakit/cuti (dihitung per hari kerja) sekaligus hari yang
	// sudah dijelaskan untuk "tanpa keterangan".
	rentang []domain.WorkRequest
}

func (s *stubPengajuan) ByUser(context.Context, string) ([]domain.WorkRequest, error) {
	return nil, nil
}
func (s *stubPengajuan) ByID(context.Context, string) (*domain.WorkRequest, error) {
	return nil, domain.ErrTidakDitemukan
}
func (s *stubPengajuan) List(context.Context, *domain.RequestStatus) ([]domain.WorkRequest, error) {
	return nil, nil
}
func (s *stubPengajuan) Create(context.Context, *domain.WorkRequest) error { return nil }
func (s *stubPengajuan) CreateMany(context.Context, []*domain.WorkRequest) error {
	return nil
}
func (s *stubPengajuan) Putuskan(context.Context, string, domain.RequestStatus, string, string, time.Time) error {
	return nil
}
func (s *stubPengajuan) DisetujuiMenggulung(context.Context, string) ([]domain.WorkRequest, error) {
	return nil, nil
}
func (s *stubPengajuan) DisetujuiRentang(context.Context, string, string) ([]domain.WorkRequest, error) {
	return s.rentang, nil
}

type stubKonfig struct{ aktif domain.KonfigurasiAktif }

func (s *stubKonfig) Ambil(context.Context) (*domain.KonfigurasiAktif, error) {
	k := s.aktif
	return &k, nil
}
func (s *stubKonfig) SimpanJadwal(context.Context, *domain.WorkSchedule) error   { return nil }
func (s *stubKonfig) SimpanKantor(context.Context, *domain.OfficeLocation) error { return nil }

// stubLibur: kalender kosong — tidak ada hari libur pada rentang uji.
type stubLibur struct{}

func (s *stubLibur) Rentang(_ context.Context, _, _ string) ([]domain.HariLibur, error) {
	return []domain.HariLibur{}, nil
}
func (s *stubLibur) Satu(_ context.Context, _ string) (domain.HariLibur, error) {
	return domain.HariLibur{}, domain.ErrTidakDitemukan
}
func (s *stubLibur) Simpan(_ context.Context, _ domain.HariLibur, _ time.Time) error {
	return nil
}
func (s *stubLibur) Hapus(_ context.Context, _ string) error         { return nil }
func (s *stubLibur) AdaTahun(_ context.Context, _ int) (bool, error) { return true, nil }

var (
	_ port.PresensiRepo  = (*stubPresensi)(nil)
	_ port.PengajuanRepo = (*stubPengajuan)(nil)
	_ port.KonfigRepo    = (*stubKonfig)(nil)
	_ port.LiburRepo     = (*stubLibur)(nil)
)
