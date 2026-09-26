package usecase

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// SumberKalender: sumber luar daftar hari libur resmi (mis. API yang mengikuti
// SKB tiga menteri). Berbentuk antarmuka supaya uji dapat memakai sumber palsu
// tanpa jaringan — sama seperti `port.FaceService` pada layanan AI.
type SumberKalender interface {
	Ambil(ctx context.Context, tahun int) ([]domain.HariLibur, error)
}

// LiburUsecase: kalender hari libur desa — dibaca semua perangkat, diubah
// pengelola akun, dan dapat ditarik ulang dari sumber resmi.
type LiburUsecase struct {
	libur    port.LiburRepo
	audit    port.AuditRepo
	sumber   SumberKalender
	sekarang func() time.Time
}

func LiburBaru(l port.LiburRepo, a port.AuditRepo, s SumberKalender) *LiburUsecase {
	return &LiburUsecase{libur: l, audit: a, sumber: s, sekarang: time.Now}
}

// CmdLibur: isian satu hari libur dari pengelola akun.
type CmdLibur struct {
	Tanggal string            `json:"tanggal"`
	Nama    string            `json:"nama"`
	Jenis   domain.JenisLibur `json:"jenis"`
}

// HasilImporLibur: ringkasan penarikan kalender resmi — supaya layar dapat
// menyebut dengan jujur apa yang berubah, bukan sekadar "berhasil".
type HasilImporLibur struct {
	Tahun     int                `json:"tahun"`
	Baru      int                `json:"baru"`
	Diubah    int                `json:"diubah"`
	Diabaikan int                `json:"diabaikan"` // catatan manual dipertahankan
	Hari      []domain.HariLibur `json:"hari"`
}

// Tahun: seluruh hari libur satu tahun. Dibaca semua pengguna yang sudah masuk —
// kalender desa bukan data rahasia, dan monitoring serta kalender riwayat butuh.
func (uc *LiburUsecase) Tahun(ctx context.Context, tahun int) ([]domain.HariLibur, error) {
	if tahun < 2000 || tahun > 2100 {
		return nil, galatValidasi("Tahun tidak sah.")
	}
	return uc.libur.Rentang(ctx,
		fmt.Sprintf("%04d-01-01", tahun), fmt.Sprintf("%04d-12-31", tahun))
}

// Simpan: tambah atau ubah satu hari libur (mis. libur lokal desa) — tercatat di
// audit beserta nilai sebelum dan sesudahnya.
func (uc *LiburUsecase) Simpan(ctx context.Context, aktor *domain.User, cmd CmdLibur) (domain.HariLibur, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return domain.HariLibur{}, err
	}
	baru, err := rapikanLibur(cmd)
	if err != nil {
		return domain.HariLibur{}, err
	}
	lama, err := uc.libur.Satu(ctx, baru.Tanggal)
	ada := err == nil
	if err != nil && !errors.Is(err, domain.ErrTidakDitemukan) {
		return domain.HariLibur{}, err
	}
	if err := uc.libur.Simpan(ctx, baru, uc.sekarang()); err != nil {
		return domain.HariLibur{}, err
	}

	aksi := "MENAMBAH_HARI_LIBUR"
	detail := "Hari libur ditambahkan: " + domain.RingkasLibur(baru) + "."
	if ada {
		aksi = "MENGUBAH_HARI_LIBUR"
		detail = "Hari libur diubah: " + domain.RingkasLibur(lama) +
			" → " + domain.RingkasLibur(baru) + "."
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, aksi, "HariLibur", baru.Tanggal, detail, uc.sekarang()))
	return baru, nil
}

// Hapus: buang satu tanggal libur (mis. cuti bersama yang dicabut pemerintah,
// atau libur lokal yang dibatalkan).
func (uc *LiburUsecase) Hapus(ctx context.Context, aktor *domain.User, tanggal string) error {
	if err := pastikanAdmin(aktor); err != nil {
		return err
	}
	if !domain.ValidTanggalISO(tanggal) {
		return galatValidasi("Tanggal harus berformat YYYY-MM-DD.")
	}
	lama, err := uc.libur.Satu(ctx, tanggal)
	if err != nil {
		if errors.Is(err, domain.ErrTidakDitemukan) {
			return galatValidasi("Tanggal itu bukan hari libur.")
		}
		return err
	}
	if err := uc.libur.Hapus(ctx, tanggal); err != nil {
		return err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGHAPUS_HARI_LIBUR", "HariLibur", tanggal,
		"Hari libur dihapus: "+domain.RingkasLibur(lama)+".", uc.sekarang()))
	return nil
}

// Impor: tarik kalender resmi satu tahun dari sumber eksternal, lalu simpan.
//
// Catatan MANUAL tidak pernah ditimpa — itu keputusan pengelola akun, misalnya
// tanggal yang diliburkan desa sendiri — sehingga dilaporkan sebagai diabaikan.
func (uc *LiburUsecase) Impor(ctx context.Context, aktor *domain.User, tahun int) (*HasilImporLibur, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if tahun < 2000 || tahun > 2100 {
		return nil, galatValidasi("Tahun tidak sah.")
	}
	if uc.sumber == nil {
		return nil, galatValidasi("Sumber kalender resmi belum diset di server.")
	}

	hari, err := uc.sumber.Ambil(ctx, tahun)
	if err != nil {
		return nil, err
	}
	if len(hari) == 0 {
		return nil, galatValidasi("Sumber kalender tidak mengembalikan hari libur untuk tahun itu.")
	}

	awal, akhir := fmt.Sprintf("%04d-01-01", tahun), fmt.Sprintf("%04d-12-31", tahun)
	lama, err := uc.libur.Rentang(ctx, awal, akhir)
	if err != nil {
		return nil, err
	}
	adaSebelum := make(map[string]domain.HariLibur, len(lama))
	for _, h := range lama {
		adaSebelum[h.Tanggal] = h
	}

	hasil := &HasilImporLibur{Tahun: tahun, Hari: []domain.HariLibur{}}
	for _, h := range hari {
		sebelum, ada := adaSebelum[h.Tanggal]
		if ada && sebelum.Sumber == domain.LiburDariManual {
			hasil.Diabaikan++
			continue
		}
		if ada && sebelum.Nama == h.Nama && sebelum.Jenis == h.Jenis {
			continue // sudah sama — tidak perlu ditulis ulang
		}
		if err := uc.libur.Simpan(ctx, h, uc.sekarang()); err != nil {
			return nil, err
		}
		if ada {
			hasil.Diubah++
		} else {
			hasil.Baru++
		}
	}

	setelah, err := uc.libur.Rentang(ctx, awal, akhir)
	if err != nil {
		return nil, err
	}
	hasil.Hari = setelah
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGIMPOR_HARI_LIBUR", "HariLibur", strconv.Itoa(tahun),
		fmt.Sprintf("Kalender resmi %d ditarik: %d baru, %d diperbarui, %d catatan manual dipertahankan.",
			tahun, hasil.Baru, hasil.Diubah, hasil.Diabaikan), uc.sekarang()))
	return hasil, nil
}

// rapikanLibur: periksa & rapikan isian satu hari libur sebelum disimpan.
func rapikanLibur(cmd CmdLibur) (domain.HariLibur, error) {
	tanggal := strings.TrimSpace(cmd.Tanggal)
	nama := strings.TrimSpace(cmd.Nama)
	if !domain.ValidTanggalISO(tanggal) {
		return domain.HariLibur{}, galatValidasi("Tanggal harus berformat YYYY-MM-DD.")
	}
	if nama == "" {
		return domain.HariLibur{}, galatValidasi("Nama hari libur wajib diisi.")
	}
	if len([]rune(nama)) > 160 {
		return domain.HariLibur{}, galatValidasi("Nama hari libur terlalu panjang (maks. 160 huruf).")
	}
	jenis := cmd.Jenis
	if jenis == "" {
		// Penambahan dari pengelola akun hampir selalu libur setempat.
		jenis = domain.LiburLokal
	}
	if !jenis.Sah() {
		return domain.HariLibur{}, galatValidasi("Jenis hari libur tidak dikenal.")
	}
	return domain.HariLibur{
		Tanggal: tanggal, Nama: nama, Jenis: jenis, Sumber: domain.LiburDariManual,
	}, nil
}
