package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// DisiplinUsecase: kabar kedisiplinan ke kanal luar (webhook).
//
// Dua jalur saling melengkapi:
//
//   - kabar seketika setiap kali presensi menyimpang dari jadwal (terlambat /
//     pulang cepat) — dikirim setelah presensi tersimpan;
//   - ringkasan satu hari kerja yang dikirim pengelola akun (biasanya sore
//     hari) — menutup kasus yang tidak punya transaksi sama sekali, yaitu
//     perangkat yang belum presensi datang padahal batas masuknya sudah lewat
//     dan tidak ada pengajuan yang menjelaskannya.
//
// Keduanya hanya pemberitahuan: keputusan disiplin tetap dihitung dari waktu
// server dan tersimpan di basis data, sehingga kanal luar yang mati tidak pernah
// mengubah catatan presensi.
type DisiplinUsecase struct {
	presensi  port.PresensiRepo
	pengajuan port.PengajuanRepo
	users     port.UserRepo
	konfig    port.KonfigRepo
	libur     port.LiburRepo
	pengirim  port.PengirimDisiplin
	audit     port.AuditRepo
	sekarang  func() time.Time
}

func DisiplinBaru(p port.PresensiRepo, pj port.PengajuanRepo, u port.UserRepo, k port.KonfigRepo,
	l port.LiburRepo, pengirim port.PengirimDisiplin, a port.AuditRepo) *DisiplinUsecase {
	return DisiplinDenganJam(p, pj, u, k, l, pengirim, a, time.Now)
}

// DisiplinDenganJam: konstruktor untuk uji — jam server diganti fungsi waktu
// tertentu supaya batas "batas masuk sudah lewat" dapat diuji tanpa bergantung
// pada kapan uji dijalankan.
func DisiplinDenganJam(p port.PresensiRepo, pj port.PengajuanRepo, u port.UserRepo, k port.KonfigRepo,
	l port.LiburRepo, pengirim port.PengirimDisiplin, a port.AuditRepo, sekarang func() time.Time) *DisiplinUsecase {
	return &DisiplinUsecase{presensi: p, pengajuan: pj, users: u, konfig: k, libur: l,
		pengirim: pengirim, audit: a, sekarang: sekarang}
}

// Aktif: webhook diset dan siap dikirimi kabar. Seluruh operasi di bawah tetap
// dapat dipanggil meski tidak aktif — ringkasan tetap dihitung, hanya tidak
// dikirim.
func (uc *DisiplinUsecase) Aktif() bool {
	return uc != nil && uc.pengirim != nil && uc.pengirim.Siap()
}

// LaporPresensi: kirim kabar seketika untuk satu presensi yang sudah tersimpan.
//
// Dipanggil setelah presensi berhasil disimpan, jadi tidak mengembalikan galat:
// kanal luar yang sedang mati tidak boleh membuat perangkat gagal presensi.
// Pengiriman memakai konteks tanpa pembatalan (permintaan HTTP pengguna sudah
// selesai) dan batas waktu sendiri, supaya kabar tetap terkirim meski tanggapan
// sudah dikirim ke peramban.
func (uc *DisiplinUsecase) LaporPresensi(ctx context.Context, a domain.Attendance) {
	if !uc.Aktif() {
		return
	}
	kabar, ada := domain.KabarPresensiBaru(a)
	if !ada {
		return
	}
	ctx, batal := context.WithTimeout(context.WithoutCancel(ctx), waktuKirimKabar)
	defer batal()
	uc.kirim(ctx, kabar)
}

// waktuKirimKabar: batas waktu satu pengiriman kabar. Lebih pendek dari batas
// waktu layanan wajah karena kabar bukan bagian dari jalur kritis presensi.
const waktuKirimKabar = 6 * time.Second

// kirim: antarkan satu kabar; kegagalan dicatat sebagai audit, bukan dikembalikan
// — pengelola akun perlu tahu kanalnya bermasalah, tetapi pengguna tidak perlu
// melihat galat yang bukan salahnya.
func (uc *DisiplinUsecase) kirim(ctx context.Context, kabar domain.KabarDisiplin) {
	if err := uc.pengirim.Kirim(ctx, kabar); err != nil {
		_ = uc.audit.Create(ctx, domain.AuditBaru(aktorSistem, "GAGAL_KIRIM_KABAR_DISIPLIN",
			"KabarDisiplin", kabar.Tanggal, pesanGalatKabar(kabar, err), uc.sekarang()))
	}
}

// aktorSistem: pelaku untuk tindakan otomatis yang tidak dipicu manusia —
// audit tetap memuat nama pelaku, dan "Sistem" lebih jujur daripada nama kosong.
var aktorSistem = &domain.User{ID: "sistem", FullName: "Sistem"}

func pesanGalatKabar(kabar domain.KabarDisiplin, err error) string {
	pesan := fmt.Sprintf("Kabar %s %s gagal dikirim: %v", string(kabar.Jenis), kabar.Tanggal, err)
	if len(pesan) > 480 {
		pesan = pesan[:480]
	}
	return pesan
}

// ---------------------------------------------------------------------
// Ringkasan kedisiplinan satu hari
// ---------------------------------------------------------------------

// RingkasanHari: potret kedisiplinan satu hari kerja — siapa terlambat, siapa
// pulang cepat, dan siapa yang belum presensi datang padahal batas masuknya
// sudah lewat tanpa pengajuan yang menjelaskannya.
//
// Hari bukan hari kerja (akhir pekan atau hari libur) menghasilkan ringkasan
// kosong dengan keterangan — bukan daftar alpa, karena kewajiban presensi memang
// tidak ada pada hari itu.
func (uc *DisiplinUsecase) RingkasanHari(ctx context.Context, aktor *domain.User, tanggal string) (*domain.RingkasanDisiplin, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	tanggal, err := uc.tanggalDiminta(tanggal)
	if err != nil {
		return nil, err
	}
	hari, _ := time.ParseInLocation("2006-01-02", tanggal, domain.WITA)

	konfig, err := uc.konfig.Ambil(ctx)
	if err != nil {
		return nil, err
	}
	kalender, err := uc.kalenderHari(ctx, tanggal)
	if err != nil {
		return nil, err
	}

	ringkasan := domain.RingkasanDisiplin{
		Tanggal: tanggal, Terlambat: []domain.BarisDisiplin{}, PulangCepat: []domain.BarisDisiplin{},
		TanpaKeterangan: []domain.BarisDisiplin{}, BelumAktif: []domain.BarisDisiplin{},
	}
	if !domain.HariKerjaEfektif(konfig.Schedule, kalender, hari) {
		ringkasan.Keterangan = "Hari ini bukan hari kerja menurut jadwal " + konfig.Schedule.Name + "."
		if libur, ada := kalender.Ambil(tanggal); ada {
			ringkasan.Keterangan = "Hari libur: " + libur.Nama + "."
		}
		return &ringkasan, nil
	}
	ringkasan.HariKerja = true

	transaksi, err := uc.presensi.Tanggal(ctx, tanggal)
	if err != nil {
		return nil, err
	}
	hadir := map[string]bool{}
	for i := range transaksi {
		a := transaksi[i]
		if a.Type == domain.CheckIn {
			hadir[a.UserID] = true
		}
		jenis := domain.JenisPelanggaran("")
		switch {
		case a.Type == domain.CheckIn && a.Status == domain.Terlambat:
			jenis = domain.PelanggaranTerlambat
		case a.Type == domain.CheckOut && a.Status == domain.PulangCepat:
			jenis = domain.PelanggaranPulangCepat
		default:
			continue
		}
		baris := domain.BarisDisiplin{
			UserID: a.UserID, Nama: a.UserName, Jenis: jenis,
			Waktu: jamWITA(a.Verification.ServerTime), SelisihMenit: a.SelisihMenit,
		}
		if jenis == domain.PelanggaranTerlambat {
			ringkasan.Terlambat = append(ringkasan.Terlambat, baris)
		} else {
			ringkasan.PulangCepat = append(ringkasan.PulangCepat, baris)
		}
	}
	ringkasan.Hadir = len(hadir)

	if !uc.batasMasukLewat(konfig.Schedule, hari, tanggal) {
		// Batas masuk belum lewat: belum presensi belum berarti alpa.
		return &ringkasan, nil
	}
	dijelaskan, err := uc.dijelaskanHari(ctx, tanggal)
	if err != nil {
		return nil, err
	}
	daftar, err := uc.users.List(ctx)
	if err != nil {
		return nil, err
	}
	for i := range daftar {
		u := daftar[i]
		if u.AccountStatus != domain.Aktif || hadir[u.ID] || dijelaskan[u.ID] {
			continue
		}
		if u.DibuatPada != "" && tanggal < u.DibuatPada {
			// Akun belum ada pada hari itu.
			continue
		}
		if !domain.BolehPresensi(u.BiometricStatus) {
			// Tidak dapat presensi karena pendaftaran wajahnya belum disetujui —
			// itu urusan aktivasi, bukan kedisiplinan; tetap dilaporkan terpisah
			// supaya pengelola akun tahu ada yang menunggu.
			ringkasan.BelumAktif = append(ringkasan.BelumAktif, domain.BarisDisiplin{
				UserID: u.ID, Nama: u.FullName, Jenis: domain.PelanggaranBiometrik,
				Catatan: "Biometrik belum aktif",
			})
			continue
		}
		ringkasan.TanpaKeterangan = append(ringkasan.TanpaKeterangan, domain.BarisDisiplin{
			UserID: u.ID, Nama: u.FullName, Jenis: domain.PelanggaranTanpaKeterangan,
		})
	}
	return &ringkasan, nil
}

// KirimRingkasanHari: hitung ringkasan hari lalu kirimkan ke webhook sebagai
// satu pesan. Ringkasan yang bersih tidak dikirim supaya kanal tidak penuh
// pesan "tidak ada apa-apa".
func (uc *DisiplinUsecase) KirimRingkasanHari(ctx context.Context, aktor *domain.User, tanggal string) (*domain.RingkasanDisiplin, bool, error) {
	ringkasan, err := uc.RingkasanHari(ctx, aktor, tanggal)
	if err != nil {
		return nil, false, err
	}
	kabar, ada := ringkasan.Kabar()
	if !ada {
		return ringkasan, false, nil
	}
	if !uc.Aktif() {
		return ringkasan, false, galatValidasi("Webhook disiplin belum diset, jadi ringkasan tidak dapat dikirim.")
	}
	if err := uc.pengirim.Kirim(ctx, kabar); err != nil {
		// Permintaan ini memang "kirim", jadi kegagalannya dikembalikan kepada
		// pengelola akun — bukan sekadar dicatat seperti kabar otomatis.
		_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "GAGAL_KIRIM_KABAR_DISIPLIN",
			"KabarDisiplin", ringkasan.Tanggal, pesanGalatKabar(kabar, err), uc.sekarang()))
		return ringkasan, false, errors.New("ringkasan gagal dikirim: " + err.Error())
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGIRIM_KABAR_DISIPLIN",
		"KabarDisiplin", ringkasan.Tanggal,
		fmt.Sprintf("Ringkasan disiplin %s dikirim (%d penyimpangan).", ringkasan.Tanggal, ringkasan.JumlahPelanggaran()),
		uc.sekarang()))
	return ringkasan, true, nil
}

// tanggalDiminta: tanggal yang diminta pengelola akun; kosong berarti hari ini
// menurut jam WITA (bukan zona waktu server).
func (uc *DisiplinUsecase) tanggalDiminta(tanggal string) (string, error) {
	if tanggal == "" {
		return domain.TanggalISO(uc.sekarang()), nil
	}
	if !domain.ValidTanggalISO(tanggal) {
		return "", galatValidasi("Tanggal tidak sah (harus YYYY-MM-DD).")
	}
	if tanggal > domain.TanggalISO(uc.sekarang()) {
		return "", galatValidasi("Tanggal tidak boleh melewati hari ini.")
	}
	return tanggal, nil
}

// kalenderHari: kalender berisi satu tanggal libur bila tanggal itu memang libur.
func (uc *DisiplinUsecase) kalenderHari(ctx context.Context, tanggal string) (*domain.KalenderLibur, error) {
	libur, err := uc.libur.Satu(ctx, tanggal)
	if err != nil {
		if errors.Is(err, domain.ErrTidakDitemukan) {
			return domain.KalenderLiburBaru(nil), nil
		}
		return nil, err
	}
	return domain.KalenderLiburBaru([]domain.HariLibur{libur}), nil
}

// batasMasukLewat: apakah batas jam masuk sudah terlewat pada hari itu — satu-
// satunya dasar yang membuat "belum presensi" disebut tanpa keterangan. Hari ini
// dibandingkan dengan jam WITA sekarang; hari yang sudah berlalu selalu lewat;
// hari mendatang tidak pernah lewat.
func (uc *DisiplinUsecase) batasMasukLewat(jadwal domain.WorkSchedule, hari time.Time, tanggal string) bool {
	now := uc.sekarang()
	hariIni := domain.TanggalISO(now)
	if tanggal < hariIni {
		return true
	}
	if tanggal > hariIni {
		return false
	}
	depan := now.In(domain.WITA)
	return depan.Hour()*60+depan.Minute() > domain.MenitOf(jadwal.CheckInDeadline)
}

// dijelaskanHari: pengguna yang kehadirannya pada tanggal itu sudah dijelaskan
// pengajuan disetujui (izin/sakit/cuti). WFH dan dinas luar tidak menutup hari —
// keduanya tetap wajib presensi, jadi tetap muncul sebagai tanpa keterangan.
func (uc *DisiplinUsecase) dijelaskanHari(ctx context.Context, tanggal string) (map[string]bool, error) {
	daftar, err := uc.pengajuan.DisetujuiMenggulung(ctx, tanggal)
	if err != nil {
		return nil, err
	}
	dijelaskan := map[string]bool{}
	for _, r := range daftar {
		if r.Type.MenutupKehadiran() {
			dijelaskan[r.UserID] = true
		}
	}
	return dijelaskan, nil
}

// jamWITA: "HH:MM" dari waktu server ISO; kosong bila tidak terbaca.
func jamWITA(iso string) string {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		return ""
	}
	return t.In(domain.WITA).Format("15:04")
}
