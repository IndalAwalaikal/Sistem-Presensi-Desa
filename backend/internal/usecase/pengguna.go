package usecase

import (
	"context"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// PenggunaUsecase: pengelolaan akun perangkat desa oleh sekretaris/kepala desa.
// Kewenangan diperiksa ulang di sini — bukan hanya di lapisan HTTP.
type PenggunaUsecase struct {
	users    port.UserRepo
	undangan port.UndanganRepo
	audit    port.AuditRepo
	sekarang func() time.Time
}

func PenggunaBaru(u port.UserRepo, und port.UndanganRepo, a port.AuditRepo) *PenggunaUsecase {
	return &PenggunaUsecase{users: u, undangan: und, audit: a, sekarang: time.Now}
}

func (uc *PenggunaUsecase) DaftarPengguna(ctx context.Context, aktor *domain.User) ([]domain.User, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	daftar, err := uc.users.List(ctx)
	if err != nil {
		return nil, err
	}
	hasil := make([]domain.User, 0, len(daftar))
	for i := range daftar {
		hasil = append(hasil, daftar[i].User)
	}
	return hasil, nil
}

type CmdBuatPengguna struct {
	FullName    string `json:"fullName"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	EmployeeID  string `json:"employeeId"`
	Position    string `json:"position"`
	Unit        string `json:"unit"`
	PhoneNumber string `json:"phoneNumber"`
	Address     string `json:"address"`
}

// BuatPengguna: buat akun perangkat desa + terbitkan kode undangan sekali pakai.
func (uc *PenggunaUsecase) BuatPengguna(ctx context.Context, aktor *domain.User, cmd CmdBuatPengguna) (*domain.User, *domain.Undangan, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, nil, err
	}
	nama := strings.TrimSpace(cmd.FullName)
	email := strings.ToLower(strings.TrimSpace(cmd.Email))
	nip := strings.TrimSpace(cmd.EmployeeID)
	jabatan := strings.TrimSpace(cmd.Position)
	unit := strings.TrimSpace(cmd.Unit)
	peran := domain.Role(cmd.Role)

	if nama == "" || email == "" || nip == "" || jabatan == "" || unit == "" {
		return nil, nil, galatValidasi("Nama, email, NIP/NIK, jabatan, dan unit wajib diisi.")
	}
	if !strings.Contains(email, "@") {
		return nil, nil, galatValidasi("Email tidak sah.")
	}
	if !peran.Sah() {
		return nil, nil, galatValidasi("Peran tidak dikenal.")
	}
	// Aturan domain: dari aplikasi hanya akun perangkat desa yang dapat dibuat.
	if !domain.BolehTetapkanRole(aktor.Role, peran) {
		return nil, nil, &domain.GalatKewenangan{
			Pesan: "Akun dengan peran " + peran.Label() + " tidak dapat dibuat dari halaman ini.",
		}
	}

	now := uc.sekarang()
	baru := &domain.PenggunaInternal{
		User: domain.User{
			ID:              domain.IDBaru("usr"),
			FullName:        nama,
			Email:           email,
			Role:            peran,
			AccountStatus:   domain.StatusUndangan,
			BiometricStatus: domain.BiometrikBelum,
			Official: domain.Official{
				EmployeeID:  nip,
				Position:    jabatan,
				Unit:        unit,
				PhoneNumber: strings.TrimSpace(cmd.PhoneNumber),
				Address:     strings.TrimSpace(cmd.Address),
			},
		},
	}
	if err := uc.users.Create(ctx, baru); err != nil {
		return nil, nil, domain.GalatBentrokDariDB(err, "Email atau NIP/NIK sudah dipakai akun lain.")
	}
	und := domain.TerbitkanUndangan(&baru.User, now)
	if err := uc.undangan.Create(ctx, &und); err != nil {
		return nil, nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MEMBUAT_AKUN", "User", baru.ID,
		"Akun "+nama+" ("+peran.Label()+") dibuat; kode undangan diterbitkan dan berlaku 7 hari.", now))
	return &baru.User, &und, nil
}

// DaftarUndangan: riwayat kode undangan (terbaru lebih dulu).
func (uc *PenggunaUsecase) DaftarUndangan(ctx context.Context, aktor *domain.User) ([]domain.Undangan, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	return uc.undangan.List(ctx)
}

type CmdStatus struct {
	Status string `json:"status"`
}

// UbahStatus: aktifkan/nonaktifkan akun perangkat desa.
func (uc *PenggunaUsecase) UbahStatus(ctx context.Context, aktor *domain.User, id string, cmd CmdStatus) (*domain.User, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	status := domain.AccountStatus(cmd.Status)
	if !status.Sah() {
		return nil, galatValidasi("Status akun tidak dikenal.")
	}
	sasaran, err := uc.users.ByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if sasaran.ID == aktor.ID {
		return nil, galatValidasi("Status akun sendiri tidak dapat diubah dari halaman ini.")
	}
	if !domain.BolehKelolaAkun(aktor.Role, sasaran.Role) {
		return nil, &domain.GalatKewenangan{
			Pesan: "Akun dengan peran " + sasaran.Role.Label() + " tidak dapat dikelola dari halaman ini.",
		}
	}

	now := uc.sekarang()
	if err := uc.users.UpdateStatus(ctx, sasaran.ID, status); err != nil {
		return nil, err
	}
	// Menonaktifkan akun sekaligus menggugurkan kode undangan yang belum
	// dipakai, supaya akun nonaktif tidak dapat dihidupkan lewat kode lama.
	if status != domain.Aktif {
		if err := uc.undangan.GugurkanBelumDipakai(ctx, sasaran.ID); err != nil {
			return nil, err
		}
	}
	aksi := "MENGAKTIFKAN_AKUN"
	if status != domain.Aktif {
		aksi = "MENONAKTIFKAN_AKUN"
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, aksi, "User", sasaran.ID,
		"Status akun "+sasaran.FullName+" diubah menjadi "+string(status)+".", now))

	baru, err := uc.users.ByID(ctx, sasaran.ID)
	if err != nil {
		return nil, err
	}
	return &baru.User, nil
}

// ResetSandi: sandi lama digugurkan, kode undangan baru diterbitkan — sandi
// tetap hanya diketahui pemiliknya.
func (uc *PenggunaUsecase) ResetSandi(ctx context.Context, aktor *domain.User, id string) (*domain.User, *domain.Undangan, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, nil, err
	}
	sasaran, err := uc.users.ByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if sasaran.ID == aktor.ID {
		return nil, nil, galatValidasi("Kata sandi akun sendiri tidak dapat direset dari halaman ini.")
	}
	if !domain.BolehKelolaAkun(aktor.Role, sasaran.Role) {
		return nil, nil, &domain.GalatKewenangan{
			Pesan: "Akun dengan peran " + sasaran.Role.Label() + " tidak dapat dikelola dari halaman ini.",
		}
	}

	now := uc.sekarang()
	// NULL = tanpa sandi; status UNDANGAN menuntut aktivasi ulang.
	if err := uc.users.UpdateSandiStatus(ctx, sasaran.ID, nil, domain.StatusUndangan); err != nil {
		return nil, nil, err
	}
	if err := uc.undangan.GugurkanBelumDipakai(ctx, sasaran.ID); err != nil {
		return nil, nil, err
	}
	und := domain.TerbitkanUndangan(&sasaran.User, now)
	if err := uc.undangan.Create(ctx, &und); err != nil {
		return nil, nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MERESET_KATA_SANDI", "User", sasaran.ID,
		"Kata sandi "+sasaran.FullName+" digugurkan; kode undangan baru diterbitkan.", now))
	return &sasaran.User, &und, nil
}
