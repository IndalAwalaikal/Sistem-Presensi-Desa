package usecase

import (
	"golang.org/x/crypto/bcrypt"

	"presensi-anabanua/backend/internal/domain"
)

func hashSandi(s string, cost int) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(s), cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func sandiCocok(hash, s string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(s)) == nil
}

// galatValidasi membungkus pesan agar lapisan HTTP menampilkannya apa adanya.
func galatValidasi(pesan string) error {
	return &domain.GalatValidasi{Pesan: pesan}
}

// pastikanAdmin: tolak bila aktor bukan sekretaris/kepala desa — dipakai
// seluruh operasi pengelola akun (pengguna, audit, laporan, konfigurasi,
// keputusan pengajuan).
func pastikanAdmin(aktor *domain.User) error {
	if !domain.PengelolaAkun(aktor.Role) {
		return &domain.GalatKewenangan{Pesan: "Hanya sekretaris desa dan kepala desa yang berwenang."}
	}
	return nil
}
