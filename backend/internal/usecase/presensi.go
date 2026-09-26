package usecase

import (
	"context"
	"errors"
	"math"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// PresensiUsecase: keputusan presensi seluruhnya di sisi server — waktu dari
// server, jadwal dari basis data, skor biometrik dari layanan AI bila aktif.
type PresensiUsecase struct {
	presensi     port.PresensiRepo
	konfig       port.KonfigRepo
	wajah        port.FaceService
	enroll       port.EnrollRepo
	users        port.UserRepo
	pengajuan    port.PengajuanRepo
	libur        port.LiburRepo
	jadwalKhusus port.JadwalKhususRepo

	// disiplin: kabar kedisiplinan ke kanal luar. Boleh nil — presensi tidak
	// pernah bergantung padanya.
	disiplin *DisiplinUsecase

	aiAktif        bool
	ambangWajah    float64
	ambangLiveness float64
	sekarang       func() time.Time
}

func PresensiBaru(p port.PresensiRepo, k port.KonfigRepo, w port.FaceService, e port.EnrollRepo, u port.UserRepo, pj port.PengajuanRepo, l port.LiburRepo, jk port.JadwalKhususRepo, d *DisiplinUsecase, aiAktif bool, ambangWajah, ambangLiveness float64) *PresensiUsecase {
	return &PresensiUsecase{
		presensi: p, konfig: k, wajah: w, enroll: e, users: u, pengajuan: pj, libur: l, jadwalKhusus: jk,
		disiplin: d,
		aiAktif:  aiAktif, ambangWajah: ambangWajah, ambangLiveness: ambangLiveness,
		sekarang: time.Now,
	}
}

type KirimPresensi struct {
	Type           domain.AttendanceType `json:"type"`
	Mode           domain.AttendanceMode `json:"mode"`
	FaceScore      float64               `json:"faceScore"`
	LivenessScore  float64               `json:"livenessScore"`
	Location       domain.GeoPoint       `json:"location"`
	AccuracyMeters float64               `json:"accuracyMeters"`
	// FrameDataUrl opsional: bingkai yang diverifikasi layanan AI terhadap
	// embedding enrollment. Produksi wajib mengirimnya.
	FrameDataUrl string `json:"frameDataUrl,omitempty"`
}

type HasilPresensi struct {
	Accepted     bool                     `json:"accepted"`
	Attendance   *domain.Attendance       `json:"attendance,omitempty"`
	Verification *domain.VerificationMeta `json:"verification,omitempty"`
	Rejection    *Rejection               `json:"rejection,omitempty"`
}

type Rejection struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func ditolak(kode, pesan string) *HasilPresensi {
	return &HasilPresensi{Accepted: false, Rejection: &Rejection{Code: kode, Message: pesan}}
}

// Konfigurasi: lokasi kantor + jadwal aktif (atau jadwal khusus bila sedang berlaku) + akurasi maksimum.
func (uc *PresensiUsecase) Konfigurasi(ctx context.Context) (*domain.KonfigurasiAktif, error) {
	cfg, err := uc.konfig.Ambil(ctx)
	if err != nil {
		return nil, err
	}
	if uc.jadwalKhusus != nil {
		hariIni := domain.TanggalISO(uc.sekarang())
		jk, err := uc.jadwalKhusus.AktifPada(ctx, hariIni)
		if err == nil && jk != nil {
			cfg.Schedule = jk.KeWorkSchedule()
		}
	}
	return cfg, nil
}

// StatusHariIni: union BELUM_PRESENSI / SUDAH_CHECKIN / SELESAI / IZIN.
func (uc *PresensiUsecase) StatusHariIni(ctx context.Context, userID string) (*domain.TodayStatus, error) {
	now := uc.sekarang()
	tanggal := domain.TanggalISO(now)
	catatan, err := uc.presensi.HariIni(ctx, userID, tanggal)
	if err != nil {
		return nil, err
	}
	var masuk, pulang *domain.Attendance
	for i := range catatan {
		switch catatan[i].Type {
		case domain.CheckIn:
			c := catatan[i]
			masuk = &c
		case domain.CheckOut:
			c := catatan[i]
			pulang = &c
		}
	}
	// Hari libur tidak melarang presensi, hanya meniadakan kewajibannya — jadi
	// keterangannya ditempelkan ke status apa pun yang berlaku hari itu.
	libur, err := uc.hariLibur(ctx, tanggal)
	if err != nil {
		return nil, err
	}
	switch {
	case masuk != nil && pulang != nil:
		return &domain.TodayStatus{Kind: "SELESAI", CheckIn: masuk, CheckOut: pulang, Libur: libur}, nil
	case masuk != nil:
		return &domain.TodayStatus{Kind: "SUDAH_CHECKIN", Attendance: masuk, Libur: libur}, nil
	}

	pj, err := uc.pengajuan.DisetujuiMenggulung(ctx, tanggal)
	if err != nil {
		return nil, err
	}
	// Pengajuan disetujui TIDAK semuanya menutup presensi. Hanya izin/sakit/cuti
	// yang membebaskan; WFH dan dinas luar tetap wajib presensi — harinya tidak
	// dikunci, hanya saja modenya disarankan dan radius kantor tidak mengikat.
	var modeSaran *domain.AttendanceMode
	for _, r := range pj {
		if r.UserID != userID {
			continue
		}
		if r.Type.MenutupKehadiran() {
			label := labelPengajuan(r.Type)
			return &domain.TodayStatus{Kind: "IZIN", IzinLabel: &label, Libur: libur}, nil
		}
		if mode, ok := r.Type.ModeTerbuka(); ok && modeSaran == nil {
			m := mode
			modeSaran = &m
		}
	}
	// Koreksi presensi tidak menutup maupun memodekan apa pun: statusnya tetap
	// "belum presensi" supaya pintu presensi tidak ikut terkunci.
	return &domain.TodayStatus{Kind: "BELUM_PRESENSI", ModeSaran: modeSaran, Libur: libur}, nil
}

// hariLibur: keterangan hari libur untuk `tanggal`; `nil` bila bukan hari libur
// (termasuk bila kalender memang kosong).
func (uc *PresensiUsecase) hariLibur(ctx context.Context, tanggal string) (*domain.HariLibur, error) {
	h, err := uc.libur.Satu(ctx, tanggal)
	if errors.Is(err, domain.ErrTidakDitemukan) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &h, nil
}

// Riwayat: daftar presensi milik pengguna.
func (uc *PresensiUsecase) Riwayat(ctx context.Context, userID, dari, sampai string, status *domain.AttendanceStatus) ([]domain.Attendance, error) {
	return uc.presensi.Rentang(ctx, userID, dari, sampai, status)
}

// DaftarPresensi: aktivitas presensi satu tanggal (WITA) dalam bentuk baris
// monitoring yang dijanjikan frontend — untuk pengelola akun.
func (uc *PresensiUsecase) DaftarPresensi(ctx context.Context, aktor *domain.User, tanggal string) ([]domain.AttendanceListItem, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if tanggal == "" {
		tanggal = domain.TanggalISO(uc.sekarang())
	}
	if _, err := time.Parse("2006-01-02", tanggal); err != nil {
		return nil, galatValidasi("Tanggal tidak sah (YYYY-MM-DD).")
	}

	pengguna, err := uc.users.List(ctx)
	if err != nil {
		return nil, err
	}
	jabatan := map[string]string{}
	for i := range pengguna {
		jabatan[pengguna[i].ID] = pengguna[i].Official.Position
	}

	daftar, err := uc.presensi.Tanggal(ctx, tanggal)
	if err != nil {
		return nil, err
	}
	item := make([]domain.AttendanceListItem, 0, len(daftar))
	for i := range daftar {
		a := daftar[i]
		posisi := jabatan[a.UserID]
		if posisi == "" {
			posisi = "—"
		}
		item = append(item, domain.AttendanceListItem{
			ID:             a.ID,
			UserID:         a.UserID,
			UserName:       a.UserName,
			Position:       posisi,
			Type:           a.Type,
			Mode:           a.Mode,
			Status:         a.Status,
			At:             a.Verification.ServerTime,
			SelisihMenit:   a.SelisihMenit,
			DistanceMeters: a.Verification.Geofence.DistanceMeters,
		})
	}
	return item, nil
}

func ada(daftar []domain.AttendanceType, t domain.AttendanceType) bool {
	for _, x := range daftar {
		if x == t {
			return true
		}
	}
	return false
}

func bulatkan(f float64) float64 { return math.Round(f*100) / 100 }

func labelPengajuan(t domain.RequestType) string {
	switch t {
	case domain.ReqWFH:
		return "WFH — disetujui"
	case domain.ReqDinasLuar:
		return "Dinas luar — disetujui"
	case domain.ReqSakit:
		return "Sakit — disetujui"
	case domain.ReqCuti:
		return "Cuti — disetujui"
	}
	return "Izin — disetujui"
}
