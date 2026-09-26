package domain

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// Undangan aktivasi akun — alur registrasi perangkat desa (dokumen §6).
type Undangan struct {
	Kode            string  `json:"kode"`
	UserID          string  `json:"userId"`
	Nama            string  `json:"nama"`
	Email           string  `json:"email"`
	DibuatPada      string  `json:"dibuatPada"`
	KedaluwarsaPada string  `json:"kedaluwarsaPada"`
	DipakaiPada     *string `json:"dipakaiPada,omitempty"`
}

const UndanganMasaBerlakuHari = 7

// ID baru: prefiks + 16 heksa acak (crypto/rand), tanpa dependensi luar.
func IDBaru(prefiks string) string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand gagal: " + err.Error()) // tak terpulihkan
	}
	return prefiks + "-" + hex.EncodeToString(b)
}

// KodeUndangan: acak sekali pakai, format ANB-XXXX-XXXX.
func KodeUndangan() string {
	const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // tanpa I/O/0/1 agar tak rancu
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand gagal: " + err.Error())
	}
	// Offset wajib: tanpa ini kedua kelompok membaca byte yang sama sehingga
	// kode selalu berbentuk ANB-XXXX-XXXX dengan kelompok kembar.
	bagian := func(dari, n int) string {
		s := ""
		for i := dari; i < dari+n; i++ {
			s += string(abc[int(b[i])%len(abc)])
		}
		return s
	}
	return "ANB-" + bagian(0, 4) + "-" + bagian(4, 4)
}

// PerintahAktivasi: seluruh perubahan yang harus terjadi bersamaan saat kode
// undangan dipakai — kata sandi, kontak/persetujuan, dan status akun. Dibundel
// supaya satu transaksi basis data dapat menulisnya sebagai satu kesatuan.
type PerintahAktivasi struct {
	UserID      string
	HashSandi   string
	Telepon     string
	Alamat      string
	Persetujuan time.Time
	Kode        string
	// Sekarang: waktu server untuk dijadikan `dipakai_pada` dan `diubah_pada`.
	Sekarang time.Time
}

func TerbitkanUndangan(u *User, now time.Time) Undangan {
	return Undangan{
		Kode:            KodeUndangan(),
		UserID:          u.ID,
		Nama:            u.FullName,
		Email:           u.Email,
		DibuatPada:      WaktuISO(now),
		KedaluwarsaPada: WaktuISO(now.Add(UndanganMasaBerlakuHari * 24 * time.Hour)),
	}
}

func undanganDipakai(u Undangan) bool { return u.DipakaiPada != nil }

func undanganKedaluwarsa(u Undangan, now time.Time) bool {
	t, err := time.Parse(time.RFC3339Nano, u.KedaluwarsaPada)
	if err != nil {
		return true
	}
	return !t.After(now)
}

// UndanganSah: belum dipakai dan belum kedaluwarsa.
func UndanganSah(u Undangan, now time.Time) bool {
	return !undanganDipakai(u) && !undanganKedaluwarsa(u, now)
}

// PesanKodeTidakSah: alasan kode tidak dapat dipakai (null bila sah).
func PesanKodeTidakSah(u Undangan, now time.Time) string {
	switch {
	case undanganDipakai(u):
		return "Kode aktivasi ini sudah pernah dipakai. Minta sekretaris desa menerbitkan kode baru."
	case undanganKedaluwarsa(u, now):
		return "Kode aktivasi sudah kedaluwarsa. Minta sekretaris desa menerbitkan kode baru."
	}
	return ""
}
