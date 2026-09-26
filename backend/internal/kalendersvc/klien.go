// Package kalendersvc: klien sumber resmi kalender hari libur (API publik yang
// mengikuti SKB tiga menteri). Dipakai hanya saat pengelola akun menekan
// "Tarik kalender resmi" — sistem tetap berjalan penuh tanpa jaringan karena
// kalender bawaan sudah disemai dan dapat disunting manual.
package kalendersvc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
)

// batasBalasan: balasan sumber kalender jauh lebih kecil dari ini; batas hanya
// pengaman agar balasan tak terduga tidak menghabiskan memori.
const batasBalasan = 1 << 20

type Klien struct {
	url   string
	klien *http.Client
}

func KlienBaru(url string, timeout time.Duration) *Klien {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &Klien{url: strings.TrimSpace(url), klien: &http.Client{Timeout: timeout}}
}

// Siap: apakah sumber kalender diset di env.
func (k *Klien) Siap() bool { return k != nil && k.url != "" }

// baris: bentuk longgar satu entri — beberapa penyedia memakai nama kunci yang
// berbeda, jadi seluruh kemungkinan dibaca dan yang terisi dipakai.
type baris struct {
	Date        string `json:"date"`
	Tanggal     string `json:"tanggal"`
	Description string `json:"description"`
	Keterangan  string `json:"keterangan"`
	Nama        string `json:"nama"`
	Holiday     string `json:"holiday"`
	IsJoint     *bool  `json:"is_joint_holiday"`
}

// Ambil: tarik daftar hari libur satu tahun dan petakan ke bentuk domain.
//
// Menerima dua bentuk balasan yang lazim: `{"data":[…]}` dan array langsung.
// Baris yang tanggalnya tidak sah atau berbeda tahun dilewati; nama yang
// berawalan "cuti bersama" ditandai cuti bersama.
func (k *Klien) Ambil(ctx context.Context, tahun int) ([]domain.HariLibur, error) {
	if !k.Siap() {
		return nil, fmt.Errorf("sumber kalender resmi belum diset")
	}
	alamat := fmt.Sprintf("%s?year=%d", strings.TrimRight(k.url, "/"), tahun)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, alamat, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := k.klien.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sumber kalender tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sumber kalender menolak permintaan (HTTP %d)", resp.StatusCode)
	}
	badan, err := io.ReadAll(io.LimitReader(resp.Body, batasBalasan))
	if err != nil {
		return nil, err
	}
	daftar, err := uraikan(badan)
	if err != nil {
		return nil, err
	}

	hari := make(map[string]domain.HariLibur, len(daftar))
	for _, b := range daftar {
		tanggal := pertamaAda(b.Date, b.Tanggal)
		nama := pertamaAda(b.Description, b.Keterangan, b.Nama, b.Holiday)
		if !domain.ValidTanggalISO(tanggal) || domain.TahunDariISO(tanggal) != tahun {
			continue
		}
		if strings.TrimSpace(nama) == "" {
			continue
		}
		jenis := domain.LiburNasional
		if b.IsJoint != nil && *b.IsJoint || strings.HasPrefix(strings.ToLower(nama), "cuti bersama") {
			jenis = domain.CutiBersama
		}
		hari[tanggal] = domain.HariLibur{
			Tanggal: tanggal, Nama: strings.TrimSpace(nama),
			Jenis: jenis, Sumber: domain.LiburDariImpor,
		}
	}

	hasil := make([]domain.HariLibur, 0, len(hari))
	for _, h := range hari {
		hasil = append(hasil, h)
	}
	sort.Slice(hasil, func(i, j int) bool { return hasil[i].Tanggal < hasil[j].Tanggal })
	return hasil, nil
}

// uraikan: terima `{"data":[…]}` maupun `[…]`.
func uraikan(badan []byte) ([]baris, error) {
	var bersampul struct {
		Data []baris `json:"data"`
	}
	if err := json.Unmarshal(badan, &bersampul); err == nil && bersampul.Data != nil {
		return bersampul.Data, nil
	}
	var langsung []baris
	if err := json.Unmarshal(badan, &langsung); err != nil {
		return nil, fmt.Errorf("balasan sumber kalender tidak dapat dibaca")
	}
	return langsung, nil
}

func pertamaAda(nilai ...string) string {
	for _, v := range nilai {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
