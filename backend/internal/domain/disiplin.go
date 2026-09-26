package domain

import (
	"fmt"
	"strings"
	"time"
)

// ---------------------------------------------------------------------
// Kabar kedisiplinan (webhook ke kanal luar, mis. grup WhatsApp/Telegram desa)
// ---------------------------------------------------------------------
//
// Kabar ini adalah pemberitahuan, bukan penentu: seluruh vonis disiplin tetap
// dihitung dari waktu server dan tersimpan di basis data. Pengiriman yang gagal
// karena jaringan tidak pernah mengubah data presensi — karena itu pengirimnya
// bersifat opsional (kosong = fitur mati) dan kegagalannya hanya dicatat.

// JenisKabar: bentuk satu kiriman webhook.
type JenisKabar string

const (
	// KabarPresensi: kabar seketika satu transaksi presensi yang menyimpang dari
	// jadwal (terlambat atau pulang cepat).
	KabarPresensi JenisKabar = "PRESENSI"
	// KabarRingkasan: satu pesan berisi seluruh penyimpangan satu hari kerja.
	KabarRingkasan JenisKabar = "RINGKASAN_HARIAN"
)

func (j JenisKabar) Sah() bool {
	switch j {
	case KabarPresensi, KabarRingkasan:
		return true
	}
	return false
}

// JenisPelanggaran: alasan satu nama muncul pada kabar kedisiplinan.
type JenisPelanggaran string

const (
	PelanggaranTerlambat       JenisPelanggaran = "TERLAMBAT"
	PelanggaranPulangCepat     JenisPelanggaran = "PULANG_CEPAT"
	PelanggaranTanpaKeterangan JenisPelanggaran = "TANPA_KETERANGAN"
	PelanggaranBiometrik       JenisPelanggaran = "BIOMETRIK_BELUM_AKTIF"
)

// BarisDisiplin: satu perangkat pada satu kabar.
type BarisDisiplin struct {
	UserID       string           `json:"userId"`
	Nama         string           `json:"nama"`
	Jenis        JenisPelanggaran `json:"jenis"`
	Waktu        string           `json:"waktu,omitempty"`        // jam WITA "09:12"
	SelisihMenit int              `json:"selisihMenit,omitempty"` // lewat/pulang cepat berapa menit
	Catatan      string           `json:"catatan,omitempty"`
}

// KabarDisiplin: isi yang dikirim ke webhook — teks siap kirim (`pesan`) plus
// baris terstruktur (`baris`) agar penerima dapat memakainya kembali.
type KabarDisiplin struct {
	Jenis   JenisKabar      `json:"jenis"`
	Tanggal string          `json:"tanggal"`
	Pesan   string          `json:"pesan"`
	Baris   []BarisDisiplin `json:"baris"`
}

// BarisSemua: seluruh baris penyimpangan, terurut: terlambat, pulang cepat,
// lalu tanpa keterangan.
func (r RingkasanDisiplin) BarisSemua() []BarisDisiplin {
	hasil := make([]BarisDisiplin, 0,
		len(r.Terlambat)+len(r.PulangCepat)+len(r.TanpaKeterangan)+len(r.BelumAktif))
	hasil = append(hasil, r.Terlambat...)
	hasil = append(hasil, r.PulangCepat...)
	hasil = append(hasil, r.TanpaKeterangan...)
	hasil = append(hasil, r.BelumAktif...)
	return hasil
}

// JumlahPelanggaran: banyaknya baris penyimpangan (perangkat yang hadir tepat
// waktu tidak dihitung).
func (r RingkasanDisiplin) JumlahPelanggaran() int {
	return len(r.Terlambat) + len(r.PulangCepat) + len(r.TanpaKeterangan)
}

// PesanRingkas: teks siap kirim ke kanal obrolan — dibuat di server supaya
// pesan yang diterima pengelola akun sama persis dengan yang tampil di layar.
func (r RingkasanDisiplin) PesanRingkas() string {
	var b strings.Builder
	fmt.Fprintf(&b, "*Ringkasan Disiplin — %s*", TanggalIndonesia(r.Tanggal))
	if !r.HariKerja {
		b.WriteString("\n" + pesanKosong(r.Keterangan, "Hari ini bukan hari kerja."))
		return b.String()
	}
	fmt.Fprintf(&b, "\nHadir: %d perangkat", r.Hadir)
	tulisKelompok(&b, "Terlambat", r.Terlambat, func(x BarisDisiplin) string {
		return fmt.Sprintf("%s — %s (lewat %d menit)", x.Nama, pesanKosong(x.Waktu, "-"), x.SelisihMenit)
	})
	tulisKelompok(&b, "Pulang cepat", r.PulangCepat, func(x BarisDisiplin) string {
		return fmt.Sprintf("%s — %s (%d menit lebih awal)", x.Nama, pesanKosong(x.Waktu, "-"), x.SelisihMenit)
	})
	tulisKelompok(&b, "Belum presensi tanpa keterangan", r.TanpaKeterangan, func(x BarisDisiplin) string {
		return x.Nama + detailCatatan(x.Catatan)
	})
	tulisKelompok(&b, "Belum dapat presensi (biometrik belum aktif)", r.BelumAktif, func(x BarisDisiplin) string {
		return x.Nama + detailCatatan(x.Catatan)
	})
	if r.JumlahPelanggaran() == 0 && len(r.BelumAktif) == 0 {
		b.WriteString("\nTidak ada penyimpangan jadwal. Terima kasih.")
	}
	return b.String()
}

// Kabar: bungkus ringkasan satu hari menjadi satu kiriman webhook. Ringkasan
// yang bersih (tanpa penyimpangan) tidak dikirim — kanal hanya dipakai untuk hal
// yang perlu ditindaklanjuti.
func (r RingkasanDisiplin) Kabar() (KabarDisiplin, bool) {
	baris := r.BarisSemua()
	if len(baris) == 0 {
		return KabarDisiplin{}, false
	}
	return KabarDisiplin{
		Jenis:   KabarRingkasan,
		Tanggal: r.Tanggal,
		Pesan:   r.PesanRingkas(),
		Baris:   baris,
	}, true
}

// KabarPresensiBaru: kabar seketika satu transaksi presensi. Hanya status yang
// menyimpang dari jadwal yang diberitakan; presensi tepat waktu tidak
// mengganggu kanal.
func KabarPresensiBaru(a Attendance) (KabarDisiplin, bool) {
	judul := ""
	switch a.Status {
	case Terlambat:
		judul = "Terlambat"
	case PulangCepat:
		judul = "Pulang cepat"
	default:
		return KabarDisiplin{}, false
	}
	waktu, err := time.Parse(time.RFC3339Nano, a.Verification.ServerTime)
	if err != nil {
		return KabarDisiplin{}, false
	}
	tanggal := TanggalISO(waktu)
	jam := waktu.In(WITA).Format("15:04")
	ket := fmt.Sprintf("lewat %d menit dari batas jam masuk", a.SelisihMenit)
	jenis := PelanggaranTerlambat
	if a.Status == PulangCepat {
		ket = fmt.Sprintf("%d menit sebelum jam pulang", a.SelisihMenit)
		jenis = PelanggaranPulangCepat
	}
	return KabarDisiplin{
		Jenis:   KabarPresensi,
		Tanggal: tanggal,
		Pesan: fmt.Sprintf("*%s — %s*\nPresensi %s pukul %s WITA pada %s (%s).",
			judul, a.UserName, jenisPresensi(a.Type), jam,
			TanggalIndonesia(tanggal), ket),
		Baris: []BarisDisiplin{{
			UserID: a.UserID, Nama: a.UserName, Jenis: jenis,
			Waktu: jam, SelisihMenit: a.SelisihMenit,
		}},
	}, true
}

func jenisPresensi(t AttendanceType) string {
	if t == CheckOut {
		return "pulang"
	}
	return "datang"
}

func tulisKelompok(b *strings.Builder, judul string, baris []BarisDisiplin, format func(BarisDisiplin) string) {
	if len(baris) == 0 {
		return
	}
	fmt.Fprintf(b, "\n\n*%s (%d)*", judul, len(baris))
	for _, x := range baris {
		b.WriteString("\n• " + format(x))
	}
}

func detailCatatan(catatan string) string {
	if strings.TrimSpace(catatan) == "" {
		return ""
	}
	return " (" + catatan + ")"
}

func pesanKosong(nilai, bawaan string) string {
	if strings.TrimSpace(nilai) == "" {
		return bawaan
	}
	return nilai
}

var namaHari = [...]string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}

var namaBulan = [...]string{"", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember"}

// TanggalIndonesia: "2026-09-26" menjadi "Sabtu, 26 September 2026". Tanggal
// yang tidak terbaca dikembalikan apa adanya supaya pesan tidak pernah kosong.
func TanggalIndonesia(iso string) string {
	t, err := time.ParseInLocation("2006-01-02", iso, WITA)
	if err != nil {
		return iso
	}
	return fmt.Sprintf("%s, %d %s %d", namaHari[t.Weekday()], t.Day(), namaBulan[t.Month()], t.Year())
}

// RingkasanDisiplin: potret kedisiplinan satu hari kerja.
type RingkasanDisiplin struct {
	Tanggal         string          `json:"tanggal"`
	HariKerja       bool            `json:"hariKerja"`
	Keterangan      string          `json:"keterangan,omitempty"`
	Hadir           int             `json:"hadir"`
	Terlambat       []BarisDisiplin `json:"terlambat"`
	PulangCepat     []BarisDisiplin `json:"pulangCepat"`
	TanpaKeterangan []BarisDisiplin `json:"tanpaKeterangan"`
	BelumAktif      []BarisDisiplin `json:"belumAktif"`
}
