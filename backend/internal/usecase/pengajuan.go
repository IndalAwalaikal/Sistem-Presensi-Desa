package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// PengajuanUsecase: ajukan WFH/izin/sakit/cuti/dinas luar/koreksi.
type PengajuanUsecase struct {
	repo     port.PengajuanRepo
	users    port.UserRepo
	audit    port.AuditRepo
	sekarang func() time.Time
}

func PengajuanBaru(r port.PengajuanRepo, u port.UserRepo, a port.AuditRepo) *PengajuanUsecase {
	return &PengajuanUsecase{repo: r, users: u, audit: a, sekarang: time.Now}
}

func (uc *PengajuanUsecase) MilikSaya(ctx context.Context, userID string) ([]domain.WorkRequest, error) {
	return uc.repo.ByUser(ctx, userID)
}

type KirimPengajuan struct {
	UserID    string             `json:"userId"`
	Type      domain.RequestType `json:"type"`
	StartDate string             `json:"startDate"`
	EndDate   string             `json:"endDate"`
	Reason    string             `json:"reason"`
}

func (uc *PengajuanUsecase) Kirim(ctx context.Context, aktor *domain.User, cmd KirimPengajuan) (*domain.WorkRequest, error) {
	// Pengguna hanya mengajukan untuk dirinya sendiri.
	if cmd.UserID != aktor.ID {
		return nil, &domain.GalatKewenangan{Pesan: "Pengajuan hanya untuk akun sendiri."}
	}
	if err := periksaPengajuan(cmd.Type, cmd.StartDate, cmd.EndDate, cmd.Reason); err != nil {
		return nil, err
	}

	now := uc.sekarang()
	r := &domain.WorkRequest{
		ID:        domain.IDBaru("req"),
		Type:      cmd.Type,
		UserID:    aktor.ID,
		UserName:  aktor.FullName,
		StartDate: cmd.StartDate,
		EndDate:   cmd.EndDate,
		Reason:    strings.TrimSpace(cmd.Reason),
		Status:    domain.ReqMenunggu,
		CreatedAt: domain.WaktuISO(now),
	}
	if err := uc.repo.Create(ctx, r); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MEMBUAT_PENGAJUAN", "WorkRequest", r.ID,
		"Pengajuan "+string(r.Type)+" dikirim.", now))
	return r, nil
}

// Batalkan: hanya pengaju yang berstatus MENUNGGU dapat membatalkan.
func (uc *PengajuanUsecase) Batalkan(ctx context.Context, aktor *domain.User, id string) (*domain.WorkRequest, error) {
	r, err := uc.repo.ByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if r.UserID != aktor.ID {
		return nil, &domain.GalatKewenangan{Pesan: "Pengajuan ini bukan milik Anda."}
	}
	if r.Status != domain.ReqMenunggu {
		return nil, galatValidasi("Hanya pengajuan yang masih menunggu dapat dibatalkan.")
	}
	now := uc.sekarang()
	if err := uc.repo.Putuskan(ctx, r.ID, domain.ReqDibatal, aktor.FullName, "Dibatalkan pengaju.", now); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MEMBATALKAN_PENGAJUAN", "WorkRequest", r.ID,
		"Pengajuan dibatalkan oleh pengaju.", now))
	return uc.repo.ByID(ctx, id)
}

// ---------------------------------------------------------------------
// Keputusan pengelola akun atas pengajuan
// ---------------------------------------------------------------------

// DaftarPengajuan: seluruh pengajuan, dapat disaring status.
func (uc *PengajuanUsecase) DaftarPengajuan(ctx context.Context, aktor *domain.User, status *domain.RequestStatus) ([]domain.WorkRequest, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	return uc.repo.List(ctx, status)
}

type CmdPutuskan struct {
	RequestID string `json:"requestId"`
	Approve   bool   `json:"approve"`
	Note      string `json:"note"`
}

// PutuskanPengajuan: setujui/ditolak dengan catatan.
func (uc *PengajuanUsecase) PutuskanPengajuan(ctx context.Context, aktor *domain.User, cmd CmdPutuskan) (*domain.WorkRequest, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	r, err := uc.repo.ByID(ctx, cmd.RequestID)
	if err != nil {
		return nil, err
	}
	if r.Status != domain.ReqMenunggu {
		return nil, galatValidasi("Pengajuan ini sudah diputuskan.")
	}
	now := uc.sekarang()
	status := domain.ReqDitolak
	if cmd.Approve {
		status = domain.ReqDisetujui
	}
	if err := uc.repo.Putuskan(ctx, r.ID, status, aktor.FullName, cmd.Note, now); err != nil {
		return nil, err
	}
	aksi := "MENOLAK_PENGAJUAN"
	if cmd.Approve {
		aksi = "MENYETUJUI_PENGAJUAN"
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, aksi, "WorkRequest", r.ID,
		"Pengajuan "+string(r.Type)+" "+r.UserName+" diputuskan.", now))
	return uc.repo.ByID(ctx, r.ID)
}

// PengajuanMenunggu: jumlah pengajuan berstatus MENUNGGU — untuk lencana
// notifikasi pengelola akun.
func (uc *PengajuanUsecase) PengajuanMenunggu(ctx context.Context, aktor *domain.User) (int, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return 0, err
	}
	menunggu := domain.ReqMenunggu
	daftar, err := uc.repo.List(ctx, &menunggu)
	if err != nil {
		return 0, err
	}
	return len(daftar), nil
}

// ---------------------------------------------------------------------
// Pengajuan massal (mis. cuti bersama)
// ---------------------------------------------------------------------

// batasBatchMassal: satu kiriman massal tidak boleh mencakup lebih dari ini —
// menjaga agar satu permintaan HTTP tidak pernah menulis ribuan baris sekaligus.
const batasBatchMassal = 200

// CmdPengajuanMassal: satu pengajuan yang sama untuk banyak perangkat. Hanya
// pengelola akun yang boleh mengirim — perangkat tidak dapat mengajukan cuti
// atas nama rekannya.
type CmdPengajuanMassal struct {
	Type      domain.RequestType `json:"type"`
	StartDate string             `json:"startDate"`
	EndDate   string             `json:"endDate"`
	Reason    string             `json:"reason"`
	UserIDs   []string           `json:"userIds"`
}

// HasilPengajuanMassal: batch yang tersimpan beserta seluruh barisnya.
type HasilPengajuanMassal struct {
	BatchID   string               `json:"batchId"`
	Jumlah    int                  `json:"jumlah"`
	Pengajuan []domain.WorkRequest `json:"pengajuan"`
}

// KirimMassal: buat satu pengajuan untuk setiap pengguna terdaftar dalam
// `UserIDs`, semuanya dalam satu transaksi basis data dan satu penanda batch.
//
// Daftar perangkat divalidasi lebih dahulu (id dikenal, tanpa duplikat, tidak
// melebihi batas) dan seluruh baris ditulis sekali jalan, sehingga tidak pernah
// ada batch yang masuk separuh: entah semua perangkat tercatat, entah tidak ada
// satu pun. Pengajuan yang sudah ada sebelumnya dibiarkan apa adanya — untuk
// rentang yang sama, pengelola akun cukup memutuskan pengajuan yang ada.
func (uc *PengajuanUsecase) KirimMassal(ctx context.Context, aktor *domain.User, cmd CmdPengajuanMassal) (*HasilPengajuanMassal, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if err := periksaPengajuan(cmd.Type, cmd.StartDate, cmd.EndDate, cmd.Reason); err != nil {
		return nil, err
	}
	if uc.users == nil {
		return nil, galatValidasi("Data pengguna tidak tersedia.")
	}
	peserta, err := uc.pesertaSah(ctx, cmd.UserIDs)
	if err != nil {
		return nil, err
	}

	now := uc.sekarang()
	batchID := domain.IDBaru("bch")
	alasan := strings.TrimSpace(cmd.Reason)
	buat := make([]*domain.WorkRequest, 0, len(peserta))
	for _, u := range peserta {
		buat = append(buat, &domain.WorkRequest{
			ID:        domain.IDBaru("req"),
			Type:      cmd.Type,
			UserID:    u.ID,
			UserName:  u.FullName,
			StartDate: cmd.StartDate,
			EndDate:   cmd.EndDate,
			Reason:    alasan,
			Status:    domain.ReqMenunggu,
			CreatedAt: domain.WaktuISO(now),
			BatchID:   batchID,
		})
	}
	if err := uc.repo.CreateMany(ctx, buat); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MEMBUAT_PENGAJUAN_MASSAL", "WorkRequestBatch", batchID,
		fmt.Sprintf("Pengajuan %s massal untuk %d perangkat (%s s/d %s).",
			string(cmd.Type), len(buat), cmd.StartDate, cmd.EndDate), now))

	hasil := &HasilPengajuanMassal{BatchID: batchID, Jumlah: len(buat), Pengajuan: make([]domain.WorkRequest, 0, len(buat))}
	for _, r := range buat {
		hasil.Pengajuan = append(hasil.Pengajuan, *r)
	}
	return hasil, nil
}

// pesertaSah: ubah daftar id menjadi pengguna yang benar-benar ada, tanpa
// duplikat. Id yang tidak dikenal menggagalkan seluruh pengajuan — lebih baik
// pengelola akun memperbaiki daftarnya daripada sebagian perangkat diam-diam
// tidak tercatat.
func (uc *PengajuanUsecase) pesertaSah(ctx context.Context, ids []string) ([]*domain.PenggunaInternal, error) {
	if len(ids) == 0 {
		return nil, galatValidasi("Pilih minimal satu perangkat.")
	}
	if len(ids) > batasBatchMassal {
		return nil, galatValidasi(fmt.Sprintf("Satu kiriman massal paling banyak %d perangkat.", batasBatchMassal))
	}
	terlihat := make(map[string]bool, len(ids))
	peserta := make([]*domain.PenggunaInternal, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || terlihat[id] {
			continue
		}
		terlihat[id] = true
		u, err := uc.users.ByID(ctx, id)
		if err != nil {
			return nil, galatValidasi("Ada perangkat yang tidak ditemukan pada daftar pengguna.")
		}
		peserta = append(peserta, u)
	}
	if len(peserta) == 0 {
		return nil, galatValidasi("Pilih minimal satu perangkat.")
	}
	return peserta, nil
}

// periksaPengajuan: aturan isi pengajuan yang sama untuk jalur tunggal maupun
// massal — supaya jalur massal tidak pernah lebih longgar daripada jalur biasa.
func periksaPengajuan(tipe domain.RequestType, startDate, endDate, alasan string) error {
	if !tipe.Sah() {
		return galatValidasi("Jenis pengajuan tidak dikenal.")
	}
	mulai, err := tanggalSah(startDate)
	if err != nil {
		return galatValidasi("Tanggal mulai tidak sah (harus YYYY-MM-DD).")
	}
	selesai, err := tanggalSah(endDate)
	if err != nil {
		return galatValidasi("Tanggal selesai tidak sah (harus YYYY-MM-DD).")
	}
	if selesai.Before(mulai) {
		return galatValidasi("Tanggal selesai tidak boleh sebelum tanggal mulai.")
	}
	if strings.TrimSpace(alasan) == "" {
		return galatValidasi("Alasan pengajuan wajib diisi.")
	}
	return nil
}

func tanggalSah(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}
