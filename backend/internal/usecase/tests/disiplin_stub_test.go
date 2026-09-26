package usecase_test

import (
	"context"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// ---------------------------------------------------------------------
// Ganda (stub) untuk uji kabar kedisiplinan
// ---------------------------------------------------------------------

// presensiStub: PresensiRepo dalam memori; hanya `Tanggal` yang berisi karena
// ringkasan harian hanya membaca transaksi satu hari.
type presensiStub struct{ hari []domain.Attendance }

func (s *presensiStub) SudahPresensi(context.Context, string, string) ([]domain.AttendanceType, error) {
	return nil, nil
}
func (s *presensiStub) HariIni(context.Context, string, string) ([]domain.Attendance, error) {
	return nil, nil
}
func (s *presensiStub) Rentang(context.Context, string, string, string, *domain.AttendanceStatus) ([]domain.Attendance, error) {
	return nil, nil
}
func (s *presensiStub) Tanggal(context.Context, string) ([]domain.Attendance, error) {
	return s.hari, nil
}
func (s *presensiStub) Create(context.Context, *domain.Attendance) error { return nil }
func (s *presensiStub) RekapBulan(context.Context, int, int) (map[string]domain.RekapBulanan, error) {
	return nil, nil
}
func (s *presensiStub) HariHadirRentang(context.Context, string, string) (map[string]map[string]bool, error) {
	return nil, nil
}
func (s *presensiStub) TransaksiRentang(context.Context, string, string) ([]domain.Attendance, error) {
	return nil, nil
}

// userStub: UserRepo dalam memori.
type userStub struct{ daftar []domain.PenggunaInternal }

func (s *userStub) ByEmail(context.Context, string) (*domain.PenggunaInternal, error) {
	return nil, domain.ErrTidakDitemukan
}
func (s *userStub) ByID(_ context.Context, id string) (*domain.PenggunaInternal, error) {
	for i := range s.daftar {
		if s.daftar[i].ID == id {
			u := s.daftar[i]
			return &u, nil
		}
	}
	return nil, domain.ErrTidakDitemukan
}
func (s *userStub) List(context.Context) ([]domain.PenggunaInternal, error) { return s.daftar, nil }
func (s *userStub) Create(context.Context, *domain.PenggunaInternal) error  { return nil }
func (s *userStub) UpdateStatus(context.Context, string, domain.AccountStatus) error {
	return nil
}
func (s *userStub) UpdateSandiStatus(context.Context, string, *string, domain.AccountStatus) error {
	return nil
}
func (s *userStub) UpdateBiometrik(context.Context, string, domain.BiometricStatus) error { return nil }
func (s *userStub) UpdateKontak(context.Context, string, string, string) error            { return nil }
func (s *userStub) UpdateSandi(context.Context, string, string) error                     { return nil }

// pengajuanStub: PengajuanRepo dalam memori; `menggulung` adalah pengajuan
// disetujui yang mencakup hari yang sedang diperiksa.
type pengajuanStub struct {
	menggulung []domain.WorkRequest
	disimpan   []*domain.WorkRequest
}

func (s *pengajuanStub) ByUser(context.Context, string) ([]domain.WorkRequest, error) {
	return nil, nil
}
func (s *pengajuanStub) ByID(context.Context, string) (*domain.WorkRequest, error) {
	return nil, domain.ErrTidakDitemukan
}
func (s *pengajuanStub) List(context.Context, *domain.RequestStatus) ([]domain.WorkRequest, error) {
	return nil, nil
}
func (s *pengajuanStub) Create(_ context.Context, r *domain.WorkRequest) error {
	s.disimpan = append(s.disimpan, r)
	return nil
}
func (s *pengajuanStub) CreateMany(_ context.Context, rs []*domain.WorkRequest) error {
	s.disimpan = append(s.disimpan, rs...)
	return nil
}
func (s *pengajuanStub) Putuskan(context.Context, string, domain.RequestStatus, string, string, time.Time) error {
	return nil
}
func (s *pengajuanStub) DisetujuiMenggulung(context.Context, string) ([]domain.WorkRequest, error) {
	return s.menggulung, nil
}
func (s *pengajuanStub) DisetujuiRentang(context.Context, string, string) ([]domain.WorkRequest, error) {
	return nil, nil
}

// liburStub: kalender kosong; satu hari libur dapat ditambahkan untuk menguji
// hari libur yang tidak pernah menghasilkan "tanpa keterangan".
type liburStub struct{ libur map[string]domain.HariLibur }

func (s *liburStub) Rentang(_ context.Context, dari, sampai string) ([]domain.HariLibur, error) {
	hasil := []domain.HariLibur{}
	for _, h := range s.libur {
		if h.Tanggal >= dari && h.Tanggal <= sampai {
			hasil = append(hasil, h)
		}
	}
	return hasil, nil
}
func (s *liburStub) Satu(_ context.Context, tanggal string) (domain.HariLibur, error) {
	if h, ada := s.libur[tanggal]; ada {
		return h, nil
	}
	return domain.HariLibur{}, domain.ErrTidakDitemukan
}
func (s *liburStub) Simpan(context.Context, domain.HariLibur, time.Time) error { return nil }
func (s *liburStub) Hapus(context.Context, string) error                       { return nil }
func (s *liburStub) AdaTahun(context.Context, int) (bool, error)               { return true, nil }

// pengirimStub: mencatat setiap kabar yang dikirim ke kanal luar.
type pengirimStub struct {
	kabar []domain.KabarDisiplin
	galat error
}

func (s *pengirimStub) Siap() bool { return true }
func (s *pengirimStub) Kirim(_ context.Context, kabar domain.KabarDisiplin) error {
	if s.galat != nil {
		return s.galat
	}
	s.kabar = append(s.kabar, kabar)
	return nil
}

var (
	_ port.PresensiRepo     = (*presensiStub)(nil)
	_ port.UserRepo         = (*userStub)(nil)
	_ port.PengajuanRepo    = (*pengajuanStub)(nil)
	_ port.LiburRepo        = (*liburStub)(nil)
	_ port.PengirimDisiplin = (*pengirimStub)(nil)
)
