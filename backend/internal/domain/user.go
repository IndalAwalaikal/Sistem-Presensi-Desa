// Package domain: entitas dan aturan inti Pengguna/Perangkat Desa.
// Murni Go — tidak tahu HTTP, SQL, maupun framework.
package domain

import "time"

type Role string

const (
	PerangkatDesa  Role = "PERANGKAT_DESA"
	SekretarisDesa Role = "SEKRETARIS_DESA"
	KepalaDesa     Role = "KEPALA_DESA"
)

var SemuaRole = []Role{PerangkatDesa, SekretarisDesa, KepalaDesa}

func (r Role) Sah() bool {
	switch r {
	case PerangkatDesa, SekretarisDesa, KepalaDesa:
		return true
	}
	return false
}

func (r Role) Label() string {
	switch r {
	case PerangkatDesa:
		return "Perangkat Desa"
	case SekretarisDesa:
		return "Sekretaris Desa"
	case KepalaDesa:
		return "Kepala Desa"
	}
	return string(r)
}

type AccountStatus string

const (
	StatusUndangan AccountStatus = "UNDANGAN"
	Aktif          AccountStatus = "AKTIF"
	Nonaktif       AccountStatus = "NONAKTIF"
)

func (s AccountStatus) Sah() bool {
	switch s {
	case StatusUndangan, Aktif, Nonaktif:
		return true
	}
	return false
}

type BiometricStatus string

const (
	BiometrikBelum       BiometricStatus = "NOT_ENROLLED"
	BiometrikMenunggu    BiometricStatus = "PENDING_VERIFICATION"
	BiometrikAktif       BiometricStatus = "ACTIVE"
	BiometrikDitolak     BiometricStatus = "REJECTED"
	BiometrikKedaluwarsa BiometricStatus = "EXPIRED"
)

func (s BiometricStatus) Sah() bool {
	switch s {
	case BiometrikBelum, BiometrikMenunggu, BiometrikAktif, BiometrikDitolak, BiometrikKedaluwarsa:
		return true
	}
	return false
}

// Kewenangan
// ---------------------------------------------------------------------
// Aturan kewenangan ditulis SEKALI di sini (paralel dengan frontend).
// Kedua peran administrasi (sekretaris & kepala desa) berkedudukan setara:
// masing-masing hanya mengelola akun perangkat desa, tidak akun satu sama lain.

func isAdminRole(r Role) bool { return r == SekretarisDesa || r == KepalaDesa }

// BolehTetapkanRole: dari aplikasi hanya akun perangkat desa yang dapat
// didaftarkan — akun administratif ditetapkan langsung di basis data.
func BolehTetapkanRole(aktor Role, peran Role) bool {
	return isAdminRole(aktor) && peran == PerangkatDesa
}

// BolehKelolaAkun: ubah status / reset kata sandi akun lain.
func BolehKelolaAkun(aktor Role, sasaran Role) bool {
	return isAdminRole(aktor) && sasaran == PerangkatDesa
}

// PengelolaAkun: peran administrasi (sekretaris desa & kepala desa) berkedudukan
// setara — dipakai router/middleware dan usecase sebagai gerbang kewenangan.
func PengelolaAkun(r Role) bool { return isAdminRole(r) }

// BolehKelolaJadwal: tetapkan jam kerja kantor (sekretaris & kepala desa).
func BolehKelolaJadwal(aktor Role) bool { return isAdminRole(aktor) }

// AkunDapatMasuk: hanya akun AKTIF yang boleh masuk.
func AkunDapatMasuk(s AccountStatus) bool { return s == Aktif }

// BolehPresensi: hanya biometrik ACTIVE.
func BolehPresensi(b BiometricStatus) bool { return b == BiometrikAktif }

// ---------------------------------------------------------------------
// Batas data yang boleh diubah pemilik akun sendiri
// ---------------------------------------------------------------------
// Dua daftar di bawah ini menjawab satu pertanyaan yang sebelumnya hanya terjawab
// "tidak bisa semua": field mana yang milik berkas kepegawaian desa dan field
// mana yang milik pemilik akun.
//
//   - FieldIdentitasTerkunci ditetapkan pengelola akun saat akun dibuat dan
//     TIDAK punya jalur tulis di aplikasi — baik oleh pemiliknya sendiri maupun
//     oleh sekretaris/kepala desa. Perbaikan nilai yang keliru dilakukan pada
//     sumber administrasinya, bukan diketik ulang dari sini.
//   - FieldProfilMandiri adalah satu-satunya data yang boleh diperbarui pemilik
//     akun, lewat POST /api/profil (kontak) dan POST /api/profil/sandi (kata
//     sandi, yang tidak pernah diketahui pengelola akun).
//
// Daftar ini dokumentasi yang dapat diuji: menambah nama ke FieldProfilMandiri
// tidak dengan sendirinya membuka jalur tulis — repository, usecase, dan handler
// harus menambahkannya secara sadar.

var FieldIdentitasTerkunci = []string{"fullName", "email", "employeeId", "position", "unit"}

var FieldProfilMandiri = []string{"phoneNumber", "address"}

// ---------------------------------------------------------------------

type Official struct {
	EmployeeID  string `json:"employeeId"`
	Position    string `json:"position"`
	Unit        string `json:"unit"`
	PhoneNumber string `json:"phoneNumber"`
	Address     string `json:"address"`
}

// User: bentuk yang persis dikonsumsi frontend (camelCase).
type User struct {
	ID                 string          `json:"id"`
	FullName           string          `json:"fullName"`
	Email              string          `json:"email"`
	Role               Role            `json:"role"`
	AccountStatus      AccountStatus   `json:"accountStatus"`
	BiometricStatus    BiometricStatus `json:"biometricStatus"`
	Official           Official        `json:"official"`
	BiometricConsentAt *string         `json:"biometricConsentAt,omitempty"`
	PhotoURL           *string         `json:"photoUrl,omitempty"`
}

// Kredensial internal — hash tidak pernah keluar dari backend.
type PenggunaInternal struct {
	User
	HashSandi *string `json:"-"`
	// DibuatPada: tanggal (WITA, "YYYY-MM-DD") akun dibuat. Dipakai rekap
	// kedisiplinan agar hari kerja sebelum akun ada tidak dihitung sebagai
	// "tanpa keterangan" — perangkat baru tidak langsung tercatat alpa.
	DibuatPada string `json:"-"`
}

func WaktuISO(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }
