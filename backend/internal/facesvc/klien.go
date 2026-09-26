// Package facesvc: klien HTTP ke layanan AI (Python) — vektorisasi dan
// pencocokan wajah. Kunci API diambil dari env; tidak pernah ditulis di kode.
package facesvc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"presensi-anabanua/backend/internal/port"
)

var _ port.FaceService = (*Klien)(nil)

type Klien struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func KlienBaru(baseURL, apiKey string, timeout time.Duration) *Klien {
	return &Klien{
		baseURL: baseURL,
		apiKey:  apiKey,
		http:    &http.Client{Timeout: timeout},
	}
}

type isiEmbed struct {
	Image string `json:"image"` // data URL foto
}

type hasilEmbed struct {
	Embedding []float64 `json:"embedding"`
	Model     string    `json:"model"`
}

type isiVerify struct {
	Image     string    `json:"image"`
	Referensi []float64 `json:"reference"`
}

type hasilVerify struct {
	Score         float64 `json:"score"`
	Match         bool    `json:"match"`
	LivenessScore float64 `json:"liveness_score"`
	Liveness      bool    `json:"liveness"`
}

func (k *Klien) Embed(ctx context.Context, dataURL string) ([]float64, error) {
	body, err := json.Marshal(isiEmbed{Image: dataURL})
	if err != nil {
		return nil, err
	}
	var hasil hasilEmbed
	if err := k.post(ctx, "/embed", body, &hasil); err != nil {
		return nil, err
	}
	if len(hasil.Embedding) == 0 {
		return nil, fmt.Errorf("layanan AI tidak mengembalikan embedding")
	}
	return hasil.Embedding, nil
}

func (k *Klien) Verify(ctx context.Context, dataURL string, referensi []float64) (float64, float64, error) {
	body, err := json.Marshal(isiVerify{Image: dataURL, Referensi: referensi})
	if err != nil {
		return 0, 0, err
	}
	var hasil hasilVerify
	if err := k.post(ctx, "/verify", body, &hasil); err != nil {
		return 0, 0, err
	}
	// Ambang cocok/tidaknya wajah & keaslian citra DIPUTUSKAN oleh backend
	// (usecase menilai skor terhadap AMBANG_WAJAH dan AMBANG_LIVENESS) —
	// balasan AI menyediakan skor mentah yang dievaluasi dari model & tekstur.
	return hasil.Score, hasil.LivenessScore, nil
}

func (k *Klien) post(ctx context.Context, jalur string, isi []byte, keluar any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, k.baseURL+jalur, bytes.NewReader(isi))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", k.apiKey)

	res, err := k.http.Do(req)
	if err != nil {
		return fmt.Errorf("layanan AI tidak terjangkau: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		pesan, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("layanan AI menolak (%d): %s", res.StatusCode, string(pesan))
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(keluar); err != nil {
		return fmt.Errorf("jawaban layanan AI tidak sah: %w", err)
	}
	return nil
}
