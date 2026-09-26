package usecase

import (
	"context"
	"math"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// EnrollUsecase: pendaftaran wajah — kirim foto, backend memanggil layanan
// AI untuk menghitung embedding, status menunggu verifikasi pengelola akun.
type EnrollUsecase struct {
	enroll   port.EnrollRepo
	wajah    port.FaceService
	users    port.UserRepo
	audit    port.AuditRepo
	aiAktif  bool
	sekarang func() time.Time
}

func EnrollBaru(e port.EnrollRepo, w port.FaceService, u port.UserRepo, a port.AuditRepo, aiAktif bool) *EnrollUsecase {
	return &EnrollUsecase{enroll: e, wajah: w, users: u, audit: a, aiAktif: aiAktif, sekarang: time.Now}
}

func (uc *EnrollUsecase) MilikSaya(ctx context.Context, userID string) (*domain.FaceEnrollment, error) {
	return uc.enroll.ByUserTerbaru(ctx, userID)
}

// ValidasiFoto: periksa satu foto melalui layanan wajah tanpa membuat
// pendaftaran atau menyimpan data apa pun. Dipanggil sebelum foto ditambahkan
// ke daftar lokal pengguna.
func (uc *EnrollUsecase) ValidasiFoto(ctx context.Context, aktor *domain.User, dataURL string) error {
	if aktor == nil {
		return &domain.GalatKewenangan{Pesan: "Sesi pengguna tidak sah."}
	}
	if !uc.aiAktif || uc.wajah == nil {
		return galatValidasi("Layanan pemeriksaan wajah belum tersedia. Foto tidak ditambahkan.")
	}
	if !strings.HasPrefix(dataURL, "data:image/") {
		return galatValidasi("Berkas harus berupa foto gambar yang sah.")
	}
	if _, err := uc.wajah.Embed(ctx, dataURL); err != nil {
		return galatValidasi("Foto ditolak. Pastikan satu wajah terlihat jelas, cukup terang, fokus, dan berada di tengah bingkai.")
	}
	return nil
}

type KirimEnrollment struct {
	UserID string                   `json:"userId"`
	Photos []domain.EnrollmentPhoto `json:"photos"`
}

func (uc *EnrollUsecase) Kirim(ctx context.Context, aktor *domain.User, cmd KirimEnrollment) (*domain.FaceEnrollment, error) {
	// Pengguna hanya dapat mendaftarkan wajahnya sendiri.
	if cmd.UserID != aktor.ID {
		return nil, &domain.GalatKewenangan{Pesan: "Pendaftaran wajah hanya untuk akun sendiri."}
	}
	if len(cmd.Photos) < domain.EnrollmentMinFoto || len(cmd.Photos) > domain.EnrollmentMaxFoto {
		return nil, galatValidasi("Sertakan 3 sampai 5 foto wajah.")
	}
	for _, p := range cmd.Photos {
		if !strings.HasPrefix(p.DataURL, "data:image/") {
			return nil, galatValidasi("Foto harus berupa data URL gambar.")
		}
	}

	// Setiap foto harus lolos deteksi satu wajah. Template dibuat dari seluruh
	// sampel agar tidak bergantung pada satu foto yang kebetulan paling baik.
	if !uc.aiAktif {
		return nil, galatValidasi("Layanan AI belum tersedia. Hubungi pengelola sistem.")
	}
	sampel := make([][]float64, 0, len(cmd.Photos))
	for _, foto := range cmd.Photos {
		embedding, err := uc.wajah.Embed(ctx, foto.DataURL)
		if err != nil {
			return nil, galatValidasi("Salah satu foto tidak lolos deteksi wajah. Periksa foto dan kirim ulang.")
		}
		sampel = append(sampel, embedding)
	}
	embedding, err := gabungEmbedding(sampel)
	if err != nil {
		return nil, galatValidasi("Template wajah tidak valid. Ambil ulang foto dengan pencahayaan cukup.")
	}

	now := uc.sekarang()
	e := &domain.FaceEnrollment{
		ID:          domain.IDBaru("enr"),
		UserID:      aktor.ID,
		UserName:    aktor.FullName,
		Status:      domain.EnrDikirim,
		Photos:      cmd.Photos,
		SubmittedAt: str(domain.WaktuISO(now)),
	}
	if err := uc.enroll.Create(ctx, e, embedding); err != nil {
		return nil, err
	}
	// Status biometrik bergeser ke "menunggu verifikasi" — antrean verifikasi
	// dan pintu presensi membaca dari sini.
	if err := uc.users.UpdateBiometrik(ctx, aktor.ID, domain.BiometrikMenunggu); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGIRIM_PENDAFTARAN_WAJAH", "FaceEnrollment", e.ID,
		"Pendaftaran wajah dikirim dan menunggu verifikasi.", now))
	return uc.enroll.ByID(ctx, e.ID)
}

// Pending: antrean verifikasi untuk pengelola akun.
func (uc *EnrollUsecase) Pending(ctx context.Context) ([]domain.FaceEnrollment, error) {
	return uc.enroll.Pending(ctx)
}

// Putuskan: setujui (biometrik ACTIVE) atau tolak (REJECTED).
func (uc *EnrollUsecase) Putuskan(ctx context.Context, aktor *domain.User, enrollmentID string, setujui bool, catatan string) (*domain.FaceEnrollment, error) {
	e, err := uc.enroll.ByID(ctx, enrollmentID)
	if err != nil {
		return nil, err
	}
	if e.Status != domain.EnrDikirim {
		return nil, galatValidasi("Pengajuan ini sudah diputuskan.")
	}
	now := uc.sekarang()
	status := domain.EnrDitolak
	biometrik := domain.BiometrikDitolak
	if setujui {
		status = domain.EnrDisetujui
		biometrik = domain.BiometrikAktif
	}
	if err := uc.enroll.Putuskan(ctx, e.ID, status, catatan, now); err != nil {
		return nil, err
	}
	if err := uc.users.UpdateBiometrik(ctx, e.UserID, biometrik); err != nil {
		return nil, err
	}
	aksi := "MENOLAK_BIOMETRIK"
	if setujui {
		aksi = "MENYETUJUI_BIOMETRIK"
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, aksi, "FaceEnrollment", e.ID,
		"Pendaftaran wajah "+e.UserName+" diputuskan.", now))
	return uc.enroll.ByID(ctx, e.ID)
}

func str(s string) *string { return &s }

// gabungEmbedding: normalisasi tiap sampel, rata-ratakan, lalu normalisasi
// hasilnya. Dimensi/angka tidak valid gagal tertutup dan tidak disimpan.
func gabungEmbedding(sampel [][]float64) ([]float64, error) {
	if len(sampel) == 0 || len(sampel[0]) < 2 {
		return nil, galatValidasi("Sampel embedding kosong.")
	}
	hasil := make([]float64, len(sampel[0]))
	for _, e := range sampel {
		if len(e) != len(hasil) {
			return nil, galatValidasi("Dimensi embedding antar foto tidak sama.")
		}
		norma := 0.0
		for _, v := range e {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, galatValidasi("Embedding mengandung angka tidak valid.")
			}
			norma += v * v
		}
		norma = math.Sqrt(norma)
		if math.IsInf(norma, 0) || math.IsNaN(norma) || norma <= 1e-12 {
			return nil, galatValidasi("Embedding kosong.")
		}
		for i, v := range e {
			hasil[i] += v / norma
		}
	}
	norma := 0.0
	for i := range hasil {
		hasil[i] /= float64(len(sampel))
		norma += hasil[i] * hasil[i]
	}
	norma = math.Sqrt(norma)
	if math.IsInf(norma, 0) || math.IsNaN(norma) || norma <= 1e-12 {
		return nil, galatValidasi("Sampel wajah saling bertentangan.")
	}
	for i := range hasil {
		hasil[i] /= norma
	}
	return hasil, nil
}
