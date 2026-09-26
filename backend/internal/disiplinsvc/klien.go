// Package disiplinsvc: klien webhook kedisiplinan — mengabarkan keterlambatan,
// pulang cepat, dan perangkat yang belum presensi ke kanal luar (mis. gateway
// WhatsApp atau bot Telegram desa).
//
// Pengiriman bersifat pemberitahuan: seluruh vonis disiplin dihitung di server
// dan tersimpan di basis data, sehingga kanal yang sedang mati tidak pernah
// mengubah catatan presensi. Klien ini hanya bertugas mengantarkan pesan,
// dengan batas waktu tegas supaya kanal yang lambat tidak menahan permintaan
// pengguna.
package disiplinsvc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"presensi-anabanua/backend/internal/domain"
)

// batasBalasan: balasan webhook tidak pernah dibutuhkan isinya, hanya status;
// batas ini menjaga balasan tak terduga tidak menghabiskan memori.
const batasBalasan = 8 << 10

type Klien struct {
	url   string
	token string
	klien *http.Client
}

// KlienBaru: alamat webhook kosong berarti fitur dimatikan (Siap() = false);
// pemanggil tidak perlu memeriksa sendiri.
func KlienBaru(url, token string, timeout time.Duration) *Klien {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Klien{
		url:   strings.TrimSpace(url),
		token: strings.TrimSpace(token),
		klien: &http.Client{Timeout: timeout},
	}
}

// Siap: apakah webhook diset di env.
func (k *Klien) Siap() bool { return k != nil && k.url != "" }

// Kirim: kirim satu kabar sebagai JSON.
//
// Balasan 2xx dianggap berhasil; selain itu kesalahan dikembalikan apa adanya
// supaya pengelola akun dapat melihat penyebabnya di log audit. Token (bila
// diset) dikirim sebagai `Authorization: Bearer` dan juga `X-Webhook-Token`,
// karena sebagian gateway hanya membaca salah satunya.
func (k *Klien) Kirim(ctx context.Context, kabar domain.KabarDisiplin) error {
	if !k.Siap() {
		return fmt.Errorf("webhook disiplin belum diset")
	}
	badan, err := json.Marshal(kabar)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, k.url, bytes.NewReader(badan))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Sumber", "presensi-anabanua")
	if k.token != "" {
		req.Header.Set("Authorization", "Bearer "+k.token)
		req.Header.Set("X-Webhook-Token", k.token)
	}

	resp, err := k.klien.Do(req)
	if err != nil {
		return fmt.Errorf("webhook disiplin tidak dapat dihubungi: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, batasBalasan))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("webhook disiplin menolak kabar (HTTP %d)", resp.StatusCode)
	}
	return nil
}
