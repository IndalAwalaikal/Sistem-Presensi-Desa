package usecase

import (
	"context"
	"fmt"
	"time"

	"presensi-anabanua/backend/internal/domain"
	"presensi-anabanua/backend/internal/port"
)

// LaporanUsecase: rekap kedisiplinan bulanan — digabung dari presensi,
// pengajuan, jadwal kerja, kalender hari libur, dan daftar perangkat aktif.
type LaporanUsecase struct {
	presensi  port.PresensiRepo
	pengajuan port.PengajuanRepo
	users     port.UserRepo
	konfig    port.KonfigRepo
	libur     port.LiburRepo
	sekarang  func() time.Time
}

func LaporanBaru(p port.PresensiRepo, pj port.PengajuanRepo, u port.UserRepo, k port.KonfigRepo, l port.LiburRepo) *LaporanUsecase {
	return &LaporanUsecase{presensi: p, pengajuan: pj, users: u, konfig: k, libur: l, sekarang: time.Now}
}

// LaporanDenganJam: konstruktor untuk uji — jam server diganti fungsi waktu
// tertentu supaya batas "hari kerja yang sudah tutup buku" dapat diuji tanpa
// bergantung pada kapan uji dijalankan.
func LaporanDenganJam(p port.PresensiRepo, pj port.PengajuanRepo, u port.UserRepo, k port.KonfigRepo, l port.LiburRepo, sekarang func() time.Time) *LaporanUsecase {
	return &LaporanUsecase{presensi: p, pengajuan: pj, users: u, konfig: k, libur: l, sekarang: sekarang}
}

// RekapBulanan: hadir/terlambat/izin/sakit/cuti/tanpa keterangan per perangkat
// aktif, dilengkapi total durasi keterlambatan dan pulang cepat.
//
// Angka "tanpa keterangan" adalah satu-satunya yang menjawab "siapa yang tidak
// melakukan presensi": hari kerja yang batas masuknya sudah lewat, tanpa presensi
// masuk, dan tanpa pengajuan yang menjelaskan (izin/sakit/cuti disetujui). WFH
// dan dinas luar tetap wajib presensi, jadi keduanya tidak menutup hari.
//
// Kolom "terlambatMenit"/"pulangCepatMenit" menjawab "lambat berapa menit/jam"
// dan "pulang cepat berapa menit/jam dari jam pulang" — dihitung dari waktu
// server tiap transaksi terhadap ambang jadwal yang berlaku.
func (uc *LaporanUsecase) RekapBulanan(ctx context.Context, aktor *domain.User, tahun, bulan int) ([]domain.MonthlyRecapRow, error) {
	if err := pastikanAdmin(aktor); err != nil {
		return nil, err
	}
	if bulan < 1 || bulan > 12 || tahun < 2000 || tahun > 2100 {
		return nil, galatValidasi("Tahun/bulan tidak sah.")
	}

	presensiRekap, err := uc.presensi.RekapBulan(ctx, tahun, bulan)
	if err != nil {
		return nil, err
	}
	// Jumlah izin/sakit/cuti TIDAK diambil dari COUNT(*) pengajuan: satu
	// pengajuan cuti lima hari menutup lima hari, dan pengajuan lintas bulan
	// tetap menyumbang hari-hari yang jatuh di bulan ini. Angkanya dihitung dari
	// pengajuan disetujui yang bersinggungan dengan bulan ini (diambil di bawah,
	// bersama bahan "tanpa keterangan") lewat `domain.HariPengajuanBulan`.

	// Bahan hitung "tanpa keterangan": jadwal berlaku (hari kerja & batas masuk),
	// hari yang benar-benar ada presensi masuk, dan hari yang sudah dijelaskan
	// pengajuan disetujui.
	konfig, err := uc.konfig.Ambil(ctx)
	if err != nil {
		return nil, err
	}
	awal := fmt.Sprintf("%04d-%02d-01", tahun, bulan)
	akhir := domain.TanggalISO(
		time.Date(tahun, time.Month(bulan), 1, 0, 0, 0, 0, domain.WITA).AddDate(0, 1, -1),
	)
	// Kalender hari libur bulan itu: libur nasional, cuti bersama, dan libur
	// lokal tidak menuntut presensi, jadi tidak pernah menjadi tanpa keterangan.
	liburBulan, err := uc.libur.Rentang(ctx, awal, akhir)
	if err != nil {
		return nil, err
	}
	kalender := domain.KalenderLiburBaru(liburBulan)
	hariKerja := domain.HariKerjaTertutup(tahun, bulan, konfig.Schedule, kalender, uc.sekarang())

	hadirRentang, err := uc.presensi.HariHadirRentang(ctx, awal, akhir)
	if err != nil {
		return nil, err
	}
	pengajuanRentang, err := uc.pengajuan.DisetujuiRentang(ctx, awal, akhir)
	if err != nil {
		return nil, err
	}
	// Hari kerja nyata yang dicakup pengajuan bulan ini — inilah angka
	// izin/sakit/cuti yang dilaporkan (bukan banyaknya berkas pengajuan).
	pengajuanHari := domain.HariPengajuanBulan(tahun, bulan, konfig.Schedule, kalender, pengajuanRentang)
	dijelaskan := map[string]map[string]bool{}
	for _, r := range pengajuanRentang {
		if !r.Type.MenutupKehadiran() {
			continue
		}
		if dijelaskan[r.UserID] == nil {
			dijelaskan[r.UserID] = map[string]bool{}
		}
		for _, tanggal := range r.HariTercakup() {
			dijelaskan[r.UserID][tanggal] = true
		}
	}

	// Durasi penyimpangan jam kerja: angka "berapa kali" dilengkapi "berapa lama".
	// Selisih dihitung dari waktu server tiap transaksi terhadap ambang jadwal —
	// aturan yang sama dengan penentuan status pada presensi, jadi tidak ada
	// kemungkinan status TERLAMBAT yang menambah nol menit.
	transaksi, err := uc.presensi.TransaksiRentang(ctx, awal, akhir)
	if err != nil {
		return nil, err
	}
	menitDisiplin := map[string]domain.MenitDisiplin{}
	for i := range transaksi {
		a := transaksi[i]
		waktu, err := time.Parse(time.RFC3339Nano, a.Verification.ServerTime)
		if err != nil {
			// Waktu server tidak terbaca: lewati transaksi itu, jangan batalkan
			// seluruh rekap.
			continue
		}
		total := menitDisiplin[a.UserID]
		total.TambahTersimpan(konfig.Schedule, a.Type, a.Status, waktu, a.SelisihMenit, true)
		menitDisiplin[a.UserID] = total
	}

	pengguna, err := uc.users.List(ctx)
	if err != nil {
		return nil, err
	}
	rows := make([]domain.MonthlyRecapRow, 0, len(pengguna))
	for i := range pengguna {
		u := pengguna[i]
		if u.AccountStatus != domain.Aktif {
			// Akun nonaktif/belum aktivasi tidak dihitung pada rekap.
			continue
		}
		row := domain.MonthlyRecapRow{
			UserID:     u.ID,
			UserName:   u.FullName,
			EmployeeID: u.Official.EmployeeID,
			Position:   u.Official.Position,
			Hadir:      presensiRekap[u.ID].Hadir,
			Terlambat:  presensiRekap[u.ID].Terlambat,
			TanpaKeterangan: domain.TanpaKeterangan(
				hariKerja, hadirRentang[u.ID], dijelaskan[u.ID], u.DibuatPada,
			),
			TerlambatMenit:   menitDisiplin[u.ID].Terlambat,
			PulangCepatMenit: menitDisiplin[u.ID].PulangCepat,
		}
		for tipe, n := range pengajuanHari[u.ID] {
			switch tipe {
			case domain.ReqIzin:
				row.Izin = n
			case domain.ReqSakit:
				row.Sakit = n
			case domain.ReqCuti:
				row.Cuti = n
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}
