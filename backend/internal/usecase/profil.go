package usecase

// Profil pemilik akun sendiri: kontak dan kata sandi. Identitas kepegawaian
// (nama, email, NIP/NIK, jabatan, unit) sengaja tidak punya jalur tulis apa pun
// di sini — lihat domain.FieldIdentitasTerkunci.

import (
	"context"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

type ProfilUsecase struct {
	users      port.UserRepo
	audit      port.AuditRepo
	bcryptCost int
	sekarang   func() time.Time
}

func ProfilBaru(u port.UserRepo, a port.AuditRepo, cost int) *ProfilUsecase {
	return &ProfilUsecase{users: u, audit: a, bcryptCost: cost, sekarang: time.Now}
}

// panjangAlamatMin: ambang alamat yang dianggap terisi sungguhan — sama dengan
// aturan frontend (core/usecase/profil.ts) supaya pesan galatnya konsisten.
const panjangAlamatMin = 8

type CmdKontak struct {
	PhoneNumber string `json:"phoneNumber"`
	Address     string `json:"address"`
}

// UbahKontak: pemilik akun memperbarui telepon & alamatnya sendiri. Id selalu
// diambil dari sesi pemanggil, bukan dari isi permintaan — tidak ada cara
// menyunting kontak akun lain lewat endpoint ini, bahkan untuk sekretaris desa.
func (uc *ProfilUsecase) UbahKontak(ctx context.Context, aktor *domain.User, cmd CmdKontak) (*domain.User, error) {
	telepon := strings.TrimSpace(cmd.PhoneNumber)
	alamat := strings.TrimSpace(cmd.Address)

	// Pengguna boleh menulis 0852-xxxx-xxxx; yang dihitung hanya angkanya.
	if n := jumlahDigit(telepon); n < 9 || n > 15 {
		return nil, galatValidasi("Nomor telepon tidak sah (9–15 angka).")
	}
	if len([]rune(alamat)) < panjangAlamatMin {
		return nil, galatValidasi("Alamat minimal 8 karakter.")
	}
	if telepon == aktor.Official.PhoneNumber && alamat == aktor.Official.Address {
		// Tidak ada yang berubah — jangan kotori jejak audit dengan aksi kosong.
		salinan := *aktor
		return &salinan, nil
	}

	now := uc.sekarang()
	if err := uc.users.UpdateKontak(ctx, aktor.ID, telepon, alamat); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MEMPERBARUI_KONTAK", "User", aktor.ID,
		"Nomor telepon dan alamat diperbarui sendiri oleh pemilik akun.", now))

	baru, err := uc.users.ByID(ctx, aktor.ID)
	if err != nil {
		return nil, err
	}
	return &baru.User, nil
}

type CmdUbahSandi struct {
	SandiLama string `json:"sandiLama"`
	SandiBaru string `json:"sandiBaru"`
}

// UbahSandi: pemilik akun mengganti kata sandinya sendiri dengan menyebut sandi
// lama sebagai bukti. Pengelola akun tidak punya cara menetapkan sandi siapa pun
// (reset hanya menerbitkan kode undangan baru), jadi sandi tetap hanya diketahui
// pemiliknya.
func (uc *ProfilUsecase) UbahSandi(ctx context.Context, aktor *domain.User, cmd CmdUbahSandi) error {
	if cmd.SandiLama == "" {
		return galatValidasi("Kata sandi lama wajib diisi.")
	}
	if pesan := validasiSandi(cmd.SandiBaru); pesan != "" {
		return galatValidasi(pesan)
	}

	akun, err := uc.users.ByID(ctx, aktor.ID)
	if err != nil {
		return err
	}
	if akun.HashSandi == nil {
		return galatValidasi("Akun ini belum punya kata sandi. Aktivasi akun terlebih dahulu.")
	}
	if !sandiCocok(*akun.HashSandi, cmd.SandiLama) {
		return galatValidasi("Kata sandi lama tidak cocok.")
	}
	if sandiCocok(*akun.HashSandi, cmd.SandiBaru) {
		return galatValidasi("Kata sandi baru harus berbeda dari kata sandi lama.")
	}

	hash, err := hashSandi(cmd.SandiBaru, uc.bcryptCost)
	if err != nil {
		return err
	}
	now := uc.sekarang()
	if err := uc.users.UpdateSandi(ctx, aktor.ID, hash); err != nil {
		return err
	}
	// Jejak audit tanpa rahasia apa pun: hanya mencatat siapa dan kapan.
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGUBAH_KATA_SANDI", "User", aktor.ID,
		"Pemilik akun mengganti kata sandinya sendiri.", now))
	return nil
}

// jumlahDigit: banyaknya angka pada sebuah teks ("0852-111" → 6).
func jumlahDigit(s string) int {
	n := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			n++
		}
	}
	return n
}
