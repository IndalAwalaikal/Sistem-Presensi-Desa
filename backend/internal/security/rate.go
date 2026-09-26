package security

import (
	"sync"
	"time"
)

// RateLimiter dalam memori: jendela bergeser sederhana per kunci
// (mis. IP atau IP+email). Untuk banyak replika, ganti penyimpanannya dengan
// Redis — antarmukanya tetap sama.
type RateLimiter struct {
	mu         sync.Mutex
	percobaan  map[string][]time.Time
	batasKunci map[string]int
	maks       int
	jendela    time.Duration
	now        func() time.Time
}

func RateLimiterBaru(maks int, jendela time.Duration) *RateLimiter {
	return &RateLimiter{
		percobaan:  make(map[string][]time.Time),
		batasKunci: make(map[string]int),
		maks:       maks,
		jendela:    jendela,
		now:        time.Now,
	}
}

// ambangBersih: bila peta percobaan sudah sebesar ini, kunci yang kedaluwarsa
// dibersihkan lebih awal daripada menunggu pemanggilan berkala.
const ambangBersih = 4096

// Bersihkan: buang kunci yang seluruh percobaannya sudah keluar dari jendela.
//
// Tanpa ini peta percobaan tumbuh selamanya: setiap IP+email yang pernah gagal
// meninggalkan satu kunci, dan penyerang yang berpindah alamat (atau mengarang
// alamat lewat header) dapat membuatnya tumbuh tanpa batas. Dipanggil berkala
// dari main.go.
func (r *RateLimiter) Bersihkan() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.bersihkanTerkunci()
}

// Boleh: catat satu percobaan; false bila melewati batas.
func (r *RateLimiter) Boleh(kunci string) bool {
	return r.BolehDenganBatas(kunci, r.maks)
}

// BolehDenganBatas: pembatas per kunci dengan ambang tersendiri, misalnya
// ambang IP lebih longgar daripada ambang IP+akun untuk mengurangi lockout NAT.
func (r *RateLimiter) BolehDenganBatas(kunci string, maks int) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if maks < 1 {
		maks = r.maks
	}
	if len(r.percobaan) >= ambangBersih {
		r.bersihkanTerkunci()
	}
	now := r.now()
	batas := now.Add(-r.jendela)

	masuk := r.percobaan[kunci][:0]
	for _, t := range r.percobaan[kunci] {
		if t.After(batas) {
			masuk = append(masuk, t)
		}
	}
	r.batasKunci[kunci] = maks
	if len(masuk) >= maks {
		r.percobaan[kunci] = masuk
		return false
	}
	r.percobaan[kunci] = append(masuk, now)
	return true
}

// Sisa: berapa detik lagi kunci dibebaskan (0 bila sekarang).
func (r *RateLimiter) Sisa(kunci string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	trys := r.percobaan[kunci]
	maks := r.batasKunci[kunci]
	if maks < 1 {
		maks = r.maks
	}
	if len(trys) < maks {
		return 0
	}
	palingLama := trys[0]
	tunggu := r.jendela - r.now().Sub(palingLama)
	if tunggu <= 0 {
		return 0
	}
	return int(tunggu.Seconds()) + 1
}

// bersihkanTerkunci: pemanggil WAJIB memegang r.mu.
func (r *RateLimiter) bersihkanTerkunci() {
	batas := r.now().Add(-r.jendela)
	for kunci, trys := range r.percobaan {
		hidup := trys[:0]
		for _, t := range trys {
			if t.After(batas) {
				hidup = append(hidup, t)
			}
		}
		if len(hidup) == 0 {
			delete(r.percobaan, kunci)
			delete(r.batasKunci, kunci)
			continue
		}
		r.percobaan[kunci] = hidup
	}
}
