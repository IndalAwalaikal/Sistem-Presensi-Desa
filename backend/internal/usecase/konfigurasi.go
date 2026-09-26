package usecase

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// KonfigurasiUsecase: menetapkan jam kerja & geofence kantor — berlaku untuk
// semua perangkat dan langsung dipakai presensi berikutnya.
type KonfigurasiUsecase struct {
	konfig       port.KonfigRepo
	audit        port.AuditRepo
	jadwalKhusus port.JadwalKhususRepo
	sekarang     func() time.Time
}

func KonfigurasiBaru(k port.KonfigRepo, a port.AuditRepo, jk port.JadwalKhususRepo) *KonfigurasiUsecase {
	return &KonfigurasiUsecase{konfig: k, audit: a, jadwalKhusus: jk, sekarang: time.Now}
}

type CmdJadwal struct {
	CheckInStart    string `json:"checkInStart"`
	CheckInDeadline string `json:"checkInDeadline"`
	CheckOutStart   string `json:"checkOutStart"`
	CheckOutEnd     string `json:"checkOutEnd"`
	WorkDays        []int  `json:"workDays"`
}

// SimpanKantor: tetapkan titik & radius geofence kantor; tercatat di audit.
func (uc *KonfigurasiUsecase) SimpanKantor(ctx context.Context, aktor *domain.User, nama string, lat, lng float64, radius int) (*domain.OfficeLocation, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if !domain.BolehKelolaJadwal(aktor.Role) {
		return nil, &domain.GalatKewenangan{Pesan: "Hanya pengelola akun yang berwenang."}
	}
	nama = strings.TrimSpace(nama)
	if nama == "" {
		return nil, galatValidasi("Nama kantor wajib diisi.")
	}
	if lat < -90 || lat > 90 {
		return nil, galatValidasi("Garis lintasi harus antara -90 dan 90.")
	}
	if lng < -180 || lng > 180 {
		return nil, galatValidasi("Garis bujur harus antara -180 dan 180.")
	}
	if radius < 20 || radius > 1000 {
		return nil, galatValidasi("Radius geofence harus 20 sampai 1000 meter.")
	}

	lama, err := uc.konfig.Ambil(ctx)
	if err != nil {
		return nil, err
	}
	baru := &domain.OfficeLocation{
		ID:           lama.Office.ID,
		Name:         nama,
		Point:        domain.GeoPoint{Latitude: lat, Longitude: lng},
		RadiusMeters: radius,
	}
	if err := uc.konfig.SimpanKantor(ctx, baru); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGUBAH_KANTOR", "OfficeLocation", baru.ID,
		"Lokasi kantor diubah: "+nama+" ("+fmtLat(lat)+", "+fmtLat(lng)+") radius "+strconv.Itoa(radius)+" m.", uc.sekarang()))
	return baru, nil
}

// SimpanJadwal: tetapkan jam masuk/pulang & hari kerja; tercatat di audit.
func (uc *KonfigurasiUsecase) SimpanJadwal(ctx context.Context, aktor *domain.User, cmd CmdJadwal) (*domain.WorkSchedule, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if !domain.BolehKelolaJadwal(aktor.Role) {
		return nil, &domain.GalatKewenangan{Pesan: "Hanya pengelola akun yang berwenang."}
	}
	if pesan := validasiJadwal(cmd); pesan != "" {
		return nil, galatValidasi(pesan)
	}

	lama, err := uc.konfig.Ambil(ctx)
	if err != nil {
		return nil, err
	}
	baru := &domain.WorkSchedule{
		ID:              lama.Schedule.ID,
		Name:            lama.Schedule.Name,
		CheckInStart:    cmd.CheckInStart,
		CheckInDeadline: cmd.CheckInDeadline,
		CheckOutStart:   cmd.CheckOutStart,
		CheckOutEnd:     cmd.CheckOutEnd,
		WorkDays:        rapikanHari(cmd.WorkDays),
	}
	if err := uc.konfig.SimpanJadwal(ctx, baru); err != nil {
		return nil, err
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGUBAH_JADWAL", "WorkSchedule", baru.ID,
		"Jam kerja diubah: "+ringkasJadwal(lama.Schedule)+" → "+ringkasJadwal(*baru)+".", uc.sekarang()))
	return baru, nil
}

// CmdJadwalKhusus: payload pembuatan jadwal khusus baru.
type CmdJadwalKhusus struct {
	Name            string `json:"name"`
	StartDate       string `json:"startDate"`
	EndDate         string `json:"endDate"`
	CheckInStart    string `json:"checkInStart"`
	CheckInDeadline string `json:"checkInDeadline"`
	CheckOutStart   string `json:"checkOutStart"`
	CheckOutEnd     string `json:"checkOutEnd"`
	WorkDays        []int  `json:"workDays"`
}

func (uc *KonfigurasiUsecase) DaftarJadwalKhusus(ctx context.Context, aktor *domain.User) ([]domain.JadwalKhusus, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if uc.jadwalKhusus == nil {
		return []domain.JadwalKhusus{}, nil
	}
	daftar, err := uc.jadwalKhusus.List(ctx)
	if err != nil {
		return nil, err
	}
	if daftar == nil {
		return []domain.JadwalKhusus{}, nil
	}
	return daftar, nil
}

func (uc *KonfigurasiUsecase) SimpanJadwalKhusus(ctx context.Context, aktor *domain.User, cmd CmdJadwalKhusus) (*domain.JadwalKhusus, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if !domain.BolehKelolaJadwal(aktor.Role) {
		return nil, &domain.GalatKewenangan{Pesan: "Hanya pengelola akun yang berwenang."}
	}
	if strings.TrimSpace(cmd.Name) == "" {
		return nil, galatValidasi("Nama jadwal khusus wajib diisi.")
	}
	if _, err := time.Parse("2006-01-02", cmd.StartDate); err != nil {
		return nil, galatValidasi("Tanggal mulai tidak sah (YYYY-MM-DD).")
	}
	if _, err := time.Parse("2006-01-02", cmd.EndDate); err != nil {
		return nil, galatValidasi("Tanggal selesai tidak sah (YYYY-MM-DD).")
	}
	if cmd.StartDate > cmd.EndDate {
		return nil, galatValidasi("Tanggal mulai tidak boleh melewati tanggal selesai.")
	}
	if pesan := validasiJadwal(CmdJadwal{
		CheckInStart:    cmd.CheckInStart,
		CheckInDeadline: cmd.CheckInDeadline,
		CheckOutStart:   cmd.CheckOutStart,
		CheckOutEnd:     cmd.CheckOutEnd,
		WorkDays:        cmd.WorkDays,
	}); pesan != "" {
		return nil, galatValidasi(pesan)
	}

	id := fmt.Sprintf("jk-%d", uc.sekarang().UnixNano())
	jk := domain.JadwalKhusus{
		ID:              id,
		Name:            strings.TrimSpace(cmd.Name),
		StartDate:       cmd.StartDate,
		EndDate:         cmd.EndDate,
		CheckInStart:    cmd.CheckInStart,
		CheckInDeadline: cmd.CheckInDeadline,
		CheckOutStart:   cmd.CheckOutStart,
		CheckOutEnd:     cmd.CheckOutEnd,
		WorkDays:        rapikanHari(cmd.WorkDays),
		CreatedBy:       aktor.FullName,
		CreatedAt:       domain.WaktuISO(uc.sekarang()),
	}

	if uc.jadwalKhusus != nil {
		if err := uc.jadwalKhusus.Simpan(ctx, jk); err != nil {
			return nil, err
		}
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENAMBAH_JADWAL_KHUSUS", "JadwalKhusus", jk.ID,
		"Jadwal khusus dibuat: "+jk.Name+" ("+jk.StartDate+" s/d "+jk.EndDate+").", uc.sekarang()))
	return &jk, nil
}

func (uc *KonfigurasiUsecase) HapusJadwalKhusus(ctx context.Context, aktor *domain.User, id string) error {
	if err := pastikanAdmin(aktor); err != nil {
		return err
	}
	if !domain.BolehKelolaJadwal(aktor.Role) {
		return &domain.GalatKewenangan{Pesan: "Hanya pengelola akun yang berwenang."}
	}
	if uc.jadwalKhusus != nil {
		if err := uc.jadwalKhusus.Hapus(ctx, id); err != nil {
			return err
		}
	}
	_ = uc.audit.Create(ctx, domain.AuditBaru(aktor, "MENGHAPUS_JADWAL_KHUSUS", "JadwalKhusus", id,
		"Jadwal khusus dihapus: "+id, uc.sekarang()))
	return nil
}

// ---------------------------------------------------------------------
// Alat bantu validasi & ringkasan jadwal
// ---------------------------------------------------------------------

func fmtLat(f float64) string { return strconv.FormatFloat(f, 'f', 5, 64) }

// ValidasiJadwal: paralel dengan validasi frontend — urutan jam yang
// mustahil ditolak sebelum disimpan supaya tidak ada jadwal yang membuat
// seluruh perangkat otomatis terlambat/pulang cepat.
func validasiJadwal(c CmdJadwal) string {
	jam := [][2]string{
		{"Jam masuk", c.CheckInStart},
		{"Batas masuk", c.CheckInDeadline},
		{"Jam pulang", c.CheckOutStart},
		{"Batas pulang", c.CheckOutEnd},
	}
	for _, j := range jam {
		if !formatJamSah(j[1]) {
			return j[0] + " harus berupa jam 24 jam, mis. 08:00."
		}
	}
	if len(c.WorkDays) == 0 {
		return "Pilih minimal satu hari kerja."
	}
	for _, h := range c.WorkDays {
		if h < 0 || h > 6 {
			return "Hari kerja tidak dikenal."
		}
	}
	if domain.MenitOf(c.CheckInStart) > domain.MenitOf(c.CheckInDeadline) {
		return "Jam masuk tidak boleh melewati batas masuk."
	}
	// Rentang yang silang/paradoks (mis. batas masuk 16:00 sedangkan jam pulang
	// 08:00) tidak boleh tersimpan: algoritma keterlambatan dan pulang cepat
	// akan menghasilkan selisih negatif yang tak berarti. Pesannya sengaja sama
	// dengan validasi frontend (`core/usecase/jadwal.ts`) supaya pengelola akun
	// membaca kalimat yang sama dari layar mana pun.
	if domain.MenitOf(c.CheckInDeadline) > domain.MenitOf(c.CheckOutStart) {
		return "Batas masuk harus sebelum jam pulang."
	}
	if domain.MenitOf(c.CheckOutStart) >= domain.MenitOf(c.CheckOutEnd) {
		return "Batas pulang harus setelah jam pulang."
	}
	return ""
}

func formatJamSah(hhmm string) bool {
	if len(hhmm) != 5 || hhmm[2] != ':' {
		return false
	}
	jam, menit := 0, 0
	for i, c := range hhmm[:2] + hhmm[3:] {
		if c < '0' || c > '9' {
			return false
		}
		if i < 2 {
			jam = jam*10 + int(c-'0')
		} else {
			menit = menit*10 + int(c-'0')
		}
	}
	return jam <= 23 && menit <= 59
}

// rapikanHari: urut Senin–Sabtu, bebas duplikat.
func rapikanHari(hari []int) []int {
	set := map[int]bool{}
	for _, h := range hari {
		set[h] = true
	}
	urut := []int{1, 2, 3, 4, 5, 6, 0}
	hasil := make([]int, 0, len(set))
	for _, h := range urut {
		if set[h] {
			hasil = append(hasil, h)
		}
	}
	return hasil
}

func ringkasJadwal(j domain.WorkSchedule) string {
	return j.CheckInStart + "-" + j.CheckInDeadline + " / " + j.CheckOutStart + "-" + j.CheckOutEnd
}
