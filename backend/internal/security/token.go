// Package security: token sesi (JWT HS256) dan hash kata sandi (bcrypt).
package security

import (
	"crypto/rand"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"presensi-anabanua/backend/internal/domain"
)

type KlaimSesi struct {
	Peran string `json:"peran"`
	jwt.RegisteredClaims
}

type Tokenizer struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
}

func TokenBaru(secret string, ttl time.Duration) *Tokenizer {
	return &Tokenizer{secret: []byte(secret), ttl: ttl, now: time.Now}
}

func (t *Tokenizer) Terbitkan(u *domain.User) (token, jti string, kedaluwarsa time.Time, err error) {
	jti, err = jtiBaru()
	if err != nil {
		return "", "", time.Time{}, err
	}
	now := t.now()
	kedaluwarsa = now.Add(t.ttl)
	klaim := KlaimSesi{
		Peran: string(u.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			Subject:   u.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(kedaluwarsa),
			Issuer:    "presensi-anabanua",
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, klaim).SignedString(t.secret)
	if err != nil {
		return "", "", time.Time{}, err
	}
	return signed, jti, kedaluwarsa, nil
}

// Baca: validasi tanda tangan + masa berlaku; kembalikan klaimnya.
func (t *Tokenizer) Baca(tokenStr string) (*KlaimSesi, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &KlaimSesi{}, func(tk *jwt.Token) (any, error) {
		if _, ok := tk.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("algoritma token tidak diharapkan: %v", tk.Header["alg"])
		}
		return t.secret, nil
	})
	if err != nil {
		return nil, domain.ErrSesiKadaluwarsa
	}
	klaim, ok := parsed.Claims.(*KlaimSesi)
	if !ok || !parsed.Valid || klaim.ID == "" || klaim.Subject == "" {
		return nil, domain.ErrSesiKadaluwarsa
	}
	return klaim, nil
}

func jtiBaru() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
