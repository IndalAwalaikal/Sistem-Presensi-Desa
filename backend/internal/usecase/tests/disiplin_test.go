package usecase_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/usecase"
)

// tanggalUji tetap; jadwal uji berlaku SETIAP hari supaya uji tidak bergantung
// pada hari apa tanggal itu jatuh.
const tanggalUji = "2026-09-24"

func jadwalUji() domain.WorkSchedule {
	return domain.WorkSchedule{
		ID: "jad-uji", Name: "Jam Kerja Uji",
		CheckInStart: "07:30", CheckInDeadline: "08:00",
		CheckOutStart: "16:00", CheckOutEnd: "17:00",
		WorkDays: []int{0, 1, 2, 3, 4, 5, 6},
	}
}

// perangkat uji: Budi terlambat, Ani tidak presensi, Citra belum dapat presensi.
func perangkatUji() []domain.PenggunaInternal {
	return []domain.PenggunaInternal{
		{User: domain.User{ID: "usr-1", FullName: "Budi", AccountStatus: domain.Aktif,
			BiometricStatus: domain.BiometrikAktif}, DibuatPada: "2025-01-01"},
		{User: domain.User{ID: "usr-2", FullName: "Ani", AccountStatus: domain.Aktif,
			BiometricStatus: domain.BiometrikAktif}, DibuatPada: "2025-01-01"},
		{User: domain.User{ID: "usr-3", FullName: "Citra", AccountStatus: domain.Aktif,
			BiometricStatus: domain.BiometrikMenunggu}, DibuatPada: "2025-01-01"},
	}
}

func adminUji() *domain.User {
	return &domain.User{ID: "usr-9", FullName: "Sekretaris", Role: domain.SekretarisDesa}
}

// konfigUji: jadwal kerja yang tersimpan, sehingga hari uji benar-benar hari kerja.
func konfigUji(t *testing.T) *konfigStub {
	t.Helper()
	j := jadwalUji()
	k := &konfigStub{}
	if err := k.SimpanJadwal(context.Background(), &j); err != nil {
		t.Fatalf("siapkan jadwal: %v", err)
	}
	return k
}

// disiplinUji: rakit usecase dengan jam server tetap supaya batas masuk 08:00
// dapat dibuat sudah lewat (atau belum) tanpa bergantung kapan uji dijalankan.
func disiplinUji(t *testing.T, jam time.Time, pengirim *pengirimStub,
	presensi *presensiStub, pengajuan *pengajuanStub, libur *liburStub) *usecase.DisiplinUsecase {
	t.Helper()
	return usecase.DisiplinDenganJam(presensi, pengajuan, &userStub{daftar: perangkatUji()},
		konfigUji(t), libur, pengirim, auditStub{}, func() time.Time { return jam })
}

// Terlambat dilaporkan dari transaksi, TanpaKeterangan dari absennya transaksi,
// dan perangkat yang belum dapat presensi dipisahkan agar tidak dituduh alpa.
func TestRingkasanHariMemisahkanTerlambatTanpaKeteranganDanBelumAktif(t *testing.T) {
	presensi := &presensiStub{hari: []domain.Attendance{{
		ID: "att-1", UserID: "usr-1", UserName: "Budi", Type: domain.CheckIn,
		Status: domain.Terlambat, SelisihMenit: 72,
		Verification: domain.VerificationMeta{ServerTime: "2026-09-24T09:12:00+08:00"},
	}}}
	uc := disiplinUji(t, time.Date(2026, 9, 24, 17, 0, 0, 0, domain.WITA),
		&pengirimStub{}, presensi, &pengajuanStub{}, &liburStub{})

	ringkasan, err := uc.RingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("ringkasan: %v", err)
	}
	if !ringkasan.HariKerja || ringkasan.Hadir != 1 {
		t.Fatalf("hari kerja/hadir tidak sesuai: %+v", ringkasan)
	}
	if len(ringkasan.Terlambat) != 1 || ringkasan.Terlambat[0].Waktu != "09:12" ||
		ringkasan.Terlambat[0].SelisihMenit != 72 {
		t.Fatalf("terlambat tidak sesuai: %+v", ringkasan.Terlambat)
	}
	if len(ringkasan.TanpaKeterangan) != 1 || ringkasan.TanpaKeterangan[0].UserID != "usr-2" {
		t.Fatalf("tanpa keterangan tidak sesuai: %+v", ringkasan.TanpaKeterangan)
	}
	if len(ringkasan.BelumAktif) != 1 || ringkasan.BelumAktif[0].UserID != "usr-3" {
		t.Fatalf("belum aktif tidak sesuai: %+v", ringkasan.BelumAktif)
	}
	if ringkasan.JumlahPelanggaran() != 2 {
		t.Fatalf("jumlah pelanggaran = %d, ingin 2", ringkasan.JumlahPelanggaran())
	}
	if !strings.Contains(ringkasan.PesanRingkas(), "Budi") {
		t.Fatalf("pesan tidak menyebut yang terlambat: %q", ringkasan.PesanRingkas())
	}
}

// Pengajuan izin yang disetujui menutup hari: perangkat itu tidak boleh muncul
// sebagai tanpa keterangan.
func TestRingkasanHariMenghormatiPengajuanDisetujui(t *testing.T) {
	pengajuan := &pengajuanStub{menggulung: []domain.WorkRequest{{
		ID: "req-1", Type: domain.ReqIzin, UserID: "usr-2", UserName: "Ani",
		StartDate: tanggalUji, EndDate: tanggalUji, Status: domain.ReqDisetujui,
	}}}
	uc := disiplinUji(t, time.Date(2026, 9, 24, 17, 0, 0, 0, domain.WITA),
		&pengirimStub{}, &presensiStub{}, pengajuan, &liburStub{})

	ringkasan, err := uc.RingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("ringkasan: %v", err)
	}
	// Ani dijelaskan izinnya, Budi tidak — jadi hanya Budi yang tanpa keterangan.
	if len(ringkasan.TanpaKeterangan) != 1 || ringkasan.TanpaKeterangan[0].UserID != "usr-1" {
		t.Fatalf("izin disetujui harus menutup hari Ani saja: %+v", ringkasan.TanpaKeterangan)
	}
	if ringkasan.JumlahPelanggaran() != 1 {
		t.Fatalf("jumlah pelanggaran = %d, ingin 1 (hanya Budi)", ringkasan.JumlahPelanggaran())
	}
}

// Sebelum batas jam masuk lewat, belum presensi belum berarti apa-apa — menuduh
// lebih awal membuat kanal berbunyi setiap pagi.
func TestRingkasanHariTidakMenuduhSebelumBatasMasuk(t *testing.T) {
	uc := disiplinUji(t, time.Date(2026, 9, 24, 7, 15, 0, 0, domain.WITA),
		&pengirimStub{}, &presensiStub{}, &pengajuanStub{}, &liburStub{})

	ringkasan, err := uc.RingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("ringkasan: %v", err)
	}
	if len(ringkasan.TanpaKeterangan) != 0 {
		t.Fatalf("batas masuk belum lewat: %+v", ringkasan.TanpaKeterangan)
	}
}

// Hari libur tidak menuntut presensi: tidak ada alpa, dan ringkasannya diberi
// keterangan supaya pengelola akun tahu sebabnya.
func TestRingkasanHariLiburTidakMenghitungAlpa(t *testing.T) {
	libur := &liburStub{libur: map[string]domain.HariLibur{
		tanggalUji: {Tanggal: tanggalUji, Nama: "Maulid Nabi", Jenis: domain.LiburNasional},
	}}
	uc := disiplinUji(t, time.Date(2026, 9, 24, 17, 0, 0, 0, domain.WITA),
		&pengirimStub{}, &presensiStub{}, &pengajuanStub{}, libur)

	ringkasan, err := uc.RingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("ringkasan: %v", err)
	}
	if ringkasan.HariKerja || len(ringkasan.TanpaKeterangan) != 0 {
		t.Fatalf("hari libur tidak boleh menghasilkan alpa: %+v", ringkasan)
	}
	if !strings.Contains(ringkasan.Keterangan, "Maulid Nabi") {
		t.Fatalf("keterangan tidak menyebut hari liburnya: %q", ringkasan.Keterangan)
	}
}

// Ringkasan yang bersih tidak dikirim — kanal hanya dipakai untuk hal yang perlu
// ditindaklanjuti.
func TestKirimRingkasanHariTidakMengirimSaatBersih(t *testing.T) {
	pengirim := &pengirimStub{}
	uc := disiplinUji(t, time.Date(2026, 9, 24, 7, 15, 0, 0, domain.WITA),
		pengirim, &presensiStub{}, &pengajuanStub{}, &liburStub{})

	_, terkirim, err := uc.KirimRingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("kirim ringkasan: %v", err)
	}
	if terkirim || len(pengirim.kabar) != 0 {
		t.Fatalf("ringkasan bersih tidak boleh dikirim: terkirim=%v kabar=%+v", terkirim, pengirim.kabar)
	}
}

// Ringkasan yang berisi penyimpangan dikirim sebagai SATU kabar, bukan satu
// kabar per nama.
func TestKirimRingkasanHariMengirimSatuKabar(t *testing.T) {
	pengirim := &pengirimStub{}
	presensi := &presensiStub{hari: []domain.Attendance{{
		ID: "att-1", UserID: "usr-1", UserName: "Budi", Type: domain.CheckOut,
		Status: domain.PulangCepat, SelisihMenit: 45,
		Verification: domain.VerificationMeta{ServerTime: "2026-09-24T15:15:00+08:00"},
	}}}
	uc := disiplinUji(t, time.Date(2026, 9, 24, 17, 0, 0, 0, domain.WITA),
		pengirim, presensi, &pengajuanStub{}, &liburStub{})

	ringkasan, terkirim, err := uc.KirimRingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("kirim ringkasan: %v", err)
	}
	if !terkirim || len(pengirim.kabar) != 1 {
		t.Fatalf("ingin satu kabar terkirim, dapat %d", len(pengirim.kabar))
	}
	kabar := pengirim.kabar[0]
	if kabar.Jenis != domain.KabarRingkasan || kabar.Tanggal != tanggalUji {
		t.Fatalf("kabar tidak sesuai: %+v", kabar)
	}
	if len(kabar.Baris) != len(ringkasan.BarisSemua()) {
		t.Fatalf("baris kabar %d tidak sama dengan baris ringkasan %d", len(kabar.Baris), len(ringkasan.BarisSemua()))
	}
	if ringkasan.JumlahPelanggaran() != 3 {
		// Pada uji ini: Budi pulang cepat + belum ada presensi datang, Ani belum
		// presensi sama sekali, dan Citra dipisahkan sebagai belum dapat presensi.
		t.Fatalf("jumlah pelanggaran = %d, ingin 3", ringkasan.JumlahPelanggaran())
	}
	if !strings.Contains(kabar.Pesan, "Pulang cepat") {
		t.Fatalf("pesan kabar tidak memuat jenis penyimpangan: %q", kabar.Pesan)
	}
}

// Kabar seketika hanya untuk status yang menyimpang.
func TestLaporPresensiHanyaSaatMenyimpang(t *testing.T) {
	pengirim := &pengirimStub{}
	uc := disiplinUji(t, time.Date(2026, 9, 24, 17, 0, 0, 0, domain.WITA),
		pengirim, &presensiStub{}, &pengajuanStub{}, &liburStub{})
	ctx := context.Background()

	uc.LaporPresensi(ctx, domain.Attendance{
		ID: "att-1", UserID: "usr-1", UserName: "Budi", Type: domain.CheckIn,
		Status:       domain.TepatWaktu,
		Verification: domain.VerificationMeta{ServerTime: "2026-09-24T07:55:00+08:00"},
	})
	if len(pengirim.kabar) != 0 {
		t.Fatalf("presensi tepat waktu tidak boleh dikabarkan: %+v", pengirim.kabar)
	}

	uc.LaporPresensi(ctx, domain.Attendance{
		ID: "att-2", UserID: "usr-1", UserName: "Budi", Type: domain.CheckIn,
		Status: domain.Terlambat, SelisihMenit: 42,
		Verification: domain.VerificationMeta{ServerTime: "2026-09-24T08:42:00+08:00"},
	})
	if len(pengirim.kabar) != 1 {
		t.Fatalf("keterlambatan harus dikabarkan: %+v", pengirim.kabar)
	}
	kabar := pengirim.kabar[0]
	if kabar.Jenis != domain.KabarPresensi || kabar.Baris[0].Jenis != domain.PelanggaranTerlambat {
		t.Fatalf("kabar seketika tidak sesuai: %+v", kabar)
	}
	if !strings.Contains(kabar.Pesan, "08:42") {
		t.Fatalf("pesan tidak memuat jam server: %q", kabar.Pesan)
	}
}

// Ringkasan harus tetap dapat dihitung saat webhook belum diset: fitur dimatikan,
// bukan dirusak.
func TestRingkasanHariTetapJalanTanpaWebhook(t *testing.T) {
	uc := usecase.DisiplinDenganJam(&presensiStub{}, &pengajuanStub{}, &userStub{daftar: perangkatUji()},
		konfigUji(t), &liburStub{}, nil, auditStub{},
		func() time.Time { return time.Date(2026, 9, 24, 17, 0, 0, 0, domain.WITA) })

	if uc.Aktif() {
		t.Fatal("webhook nil tidak boleh dianggap aktif")
	}
	ringkasan, err := uc.RingkasanHari(context.Background(), adminUji(), tanggalUji)
	if err != nil {
		t.Fatalf("ringkasan tanpa webhook: %v", err)
	}
	if len(ringkasan.TanpaKeterangan) != 2 {
		t.Fatalf("ringkasan tetap dihitung: %+v", ringkasan.TanpaKeterangan)
	}
	if _, _, err := uc.KirimRingkasanHari(context.Background(), adminUji(), tanggalUji); err == nil {
		t.Fatal("mengirim tanpa webhook harus memberi galat yang jelas")
	}
}
