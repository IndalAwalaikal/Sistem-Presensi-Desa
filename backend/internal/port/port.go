// Package port: kontrak keluar dari usecase. Implementasinya ada di
// infrastructure/mysql dan infrastructure/facesvc (dependency rule ke dalam).
package port

import (
	"context"
	"time"

	"presensi-anabanua/backend/internal/domain"
)

type UserRepo interface {
	ByEmail(ctx context.Context, email string) (*domain.PenggunaInternal, error)
	ByID(ctx context.Context, id string) (*domain.PenggunaInternal, error)
	List(ctx context.Context) ([]domain.PenggunaInternal, error)
	Create(ctx context.Context, u *domain.PenggunaInternal) error
	UpdateStatus(ctx context.Context, id string, status domain.AccountStatus) error
	UpdateSandiStatus(ctx context.Context, id string, hash *string, status domain.AccountStatus) error
	UpdateBiometrik(ctx context.Context, id string, status domain.BiometricStatus) error
	// UpdateKontak: pemilik akun memperbarui telepon & alamatnya sendiri
	// (tanpa menyentuh persetujuan wajah — itu hanya diisi sekali saat aktivasi).
	UpdateKontak(ctx context.Context, id, telepon, alamat string) error
	// UpdateSandi: ganti kata sandi sendiri; status akun tidak ikut berubah.
	UpdateSandi(ctx context.Context, id, hash string) error
}

type UndanganRepo interface {
	ByKode(ctx context.Context, kode string) (*domain.Undangan, error)
	Create(ctx context.Context, u *domain.Undangan) error
	List(ctx context.Context) ([]domain.Undangan, error)
	GugurkanBelumDipakai(ctx context.Context, userID string) error
}

// AktivasiRepo: aktivasi akun sebagai SATU transaksi basis data.
//
// Mengapa bukan tiga panggilan terpisah (ubah sandi → ubah kontak → tandai
// kode dipakai): bila langkah terakhir gagal atau dua permintaan aktivasi masuk
// bersamaan dengan kode yang sama, akun sudah terlanjur aktif dan kata sandinya
// sudah berganti sementara kodenya belum terkunci. Transaksi ini mengunci kode
// lebih dahulu, baru mengubah akun — dua-duanya berhasil atau tidak sama sekali.
type AktivasiRepo interface {
	Aktivasi(ctx context.Context, p domain.PerintahAktivasi) error
}

type PresensiRepo interface {
	SudahPresensi(ctx context.Context, userID string, tanggal string) ([]domain.AttendanceType, error)
	HariIni(ctx context.Context, userID string, tanggal string) ([]domain.Attendance, error)
	Rentang(ctx context.Context, userID, dari, sampai string, status *domain.AttendanceStatus) ([]domain.Attendance, error)
	Tanggal(ctx context.Context, tanggal string) ([]domain.Attendance, error)
	Create(ctx context.Context, a *domain.Attendance) error
	RekapBulan(ctx context.Context, tahun, bulan int) (map[string]domain.RekapBulanan, error)
	// HariHadirRentang: himpunan tanggal (ISO) yang punya presensi masuk per
	// pengguna dalam rentang tanggal inklusif — bahan hitung "tanpa keterangan".
	HariHadirRentang(ctx context.Context, dari, sampai string) (map[string]map[string]bool, error)
	// TransaksiRentang: seluruh transaksi presensi (semua pengguna) pada rentang
	// tanggal inklusif — bahan hitung "lambat berapa menit / pulang cepat berapa
	// menit". Selisihnya dihitung di domain dari waktu server tiap transaksi,
	// bukan di SQL, supaya aturannya tetap satu dengan penentuan status.
	TransaksiRentang(ctx context.Context, dari, sampai string) ([]domain.Attendance, error)
}

type EnrollRepo interface {
	ByUserTerbaru(ctx context.Context, userID string) (*domain.FaceEnrollment, error)
	ByID(ctx context.Context, id string) (*domain.FaceEnrollment, error)
	Pending(ctx context.Context) ([]domain.FaceEnrollment, error)
	Embedding(ctx context.Context, userID string) ([]float64, error)
	Create(ctx context.Context, e *domain.FaceEnrollment, embedding []float64) error
	Putuskan(ctx context.Context, id string, status domain.EnrollmentStatus, catatan string, now time.Time) error
}

type PengajuanRepo interface {
	ByUser(ctx context.Context, userID string) ([]domain.WorkRequest, error)
	ByID(ctx context.Context, id string) (*domain.WorkRequest, error)
	List(ctx context.Context, status *domain.RequestStatus) ([]domain.WorkRequest, error)
	Create(ctx context.Context, r *domain.WorkRequest) error
	// CreateMany: simpan beberapa pengajuan (massal) sebagai SATU transaksi —
	// satu batch cuti bersama tidak boleh masuk separuh bila ada galat.
	CreateMany(ctx context.Context, rs []*domain.WorkRequest) error
	Putuskan(ctx context.Context, id string, status domain.RequestStatus, oleh, catatan string, now time.Time) error
	DisetujuiMenggulung(ctx context.Context, tanggal string) ([]domain.WorkRequest, error)
	// DisetujuiRentang: pengajuan DISETUJUI yang rentangnya bersinggungan dengan
	// [dari, sampai] — dipakai rekap untuk mengetahui hari yang sudah dijelaskan
	// dan menghitung jumlah hari izin/sakit/cuti yang nyata.
	DisetujuiRentang(ctx context.Context, dari, sampai string) ([]domain.WorkRequest, error)
}

type AuditRepo interface {
	Create(ctx context.Context, log domain.AuditLog) error
	List(ctx context.Context) ([]domain.AuditLog, error)
}

type KonfigRepo interface {
	Ambil(ctx context.Context) (*domain.KonfigurasiAktif, error)
	SimpanJadwal(ctx context.Context, j *domain.WorkSchedule) error
	/** SimpanKantor: ubah titik & radius geofence kantor (admin). */
	SimpanKantor(ctx context.Context, k *domain.OfficeLocation) error
}

type JadwalKhususRepo interface {
	List(ctx context.Context) ([]domain.JadwalKhusus, error)
	AktifPada(ctx context.Context, tanggal string) (*domain.JadwalKhusus, error)
	Simpan(ctx context.Context, jk domain.JadwalKhusus) error
	Hapus(ctx context.Context, id string) error
}

// PengirimDisiplin: webhook kedisiplinan — memberi tahu kanal luar (mis. grup
// WhatsApp/Telegram perangkat desa) tentang keterlambatan, pulang cepat, dan
// perangkat yang belum presensi.
//
// Sifatnya pemberitahuan: implementasi kosong (nil) berarti fitur dimatikan,
// dan kegagalan pengiriman tidak boleh menggagalkan presensi.
type PengirimDisiplin interface {
	Siap() bool
	Kirim(ctx context.Context, kabar domain.KabarDisiplin) error
}

// LiburRepo: kalender hari libur desa (libur nasional, cuti bersama, libur lokal).
type LiburRepo interface {
	// Rentang: hari libur pada [dari, sampai] (ISO, inklusif), terurut.
	Rentang(ctx context.Context, dari, sampai string) ([]domain.HariLibur, error)
	// Satu: hari libur pada satu tanggal; domain.ErrTidakDitemukan bila tidak ada.
	Satu(ctx context.Context, tanggal string) (domain.HariLibur, error)
	// Simpan: simpan atau ubah satu tanggal libur (upsert menurut tanggal).
	Simpan(ctx context.Context, h domain.HariLibur, now time.Time) error
	// Hapus: buang satu tanggal libur.
	Hapus(ctx context.Context, tanggal string) error
	// AdaTahun: apakah satu tahun sudah punya catatan — dipakai penyemaian agar
	// suntingan pengelola akun tidak dipulihkan setiap server dinyalakan.
	AdaTahun(ctx context.Context, tahun int) (bool, error)
}

// TokenRepo: pembatalan sesi (logout) yang dapat diandalkan.
type TokenRepo interface {
	Revoke(ctx context.Context, jti string, kedaluwarsa time.Time) error
	Revoked(ctx context.Context, jti string) (bool, error)
	Bersihkan(ctx context.Context) error // hapus jti yang sudah kedaluwarsa
}

// FaceService: layanan AI (Python) — vektorisasi & pencocokan wajah.
type FaceService interface {
	// Embed: kirim satu foto (data URL), terima vektor wajah.
	Embed(ctx context.Context, dataURL string) ([]float64, error)
	// Verify: cocokkan foto terhadap vektor referensi; kembalikan skor kemiripan 0–1 dan skor liveness 0–1.
	Verify(ctx context.Context, dataURL string, referensi []float64) (skorWajah float64, skorLiveness float64, err error)
}
