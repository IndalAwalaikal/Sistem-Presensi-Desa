package security

import "golang.org/x/crypto/bcrypt"

// HashSandi: bcrypt dengan biaya dari konfigurasi.
func HashSandi(sandi string, cost int) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(sandi), cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// CekSandi: konstanta-waktu; true bila cocok.
func CekSandi(hash, sandi string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(sandi)) == nil
}
