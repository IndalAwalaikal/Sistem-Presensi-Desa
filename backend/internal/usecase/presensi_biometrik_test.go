package usecase

import (
	"context"
	"errors"
	"math"
	"testing"

	"presensi-anabanua/backend/internal/port"
)

type enrollEmbeddingUji struct {
	port.EnrollRepo
	vektor []float64
	err    error
}

func (e enrollEmbeddingUji) Embedding(context.Context, string) ([]float64, error) {
	return e.vektor, e.err
}

type faceVerifyUji struct {
	port.FaceService
	skor, hidup float64
	err         error
}

func (f faceVerifyUji) Verify(context.Context, string, []float64) (float64, float64, error) {
	return f.skor, f.hidup, f.err
}

func TestNilaiBiometrikProduksiHanyaPercayaAI(t *testing.T) {
	uc := &PresensiUsecase{
		aiAktif: true, ambangWajah: 0.62, ambangLiveness: 0.5,
		enroll: enrollEmbeddingUji{vektor: []float64{1, 0}},
		wajah:  faceVerifyUji{skor: 0.61, hidup: 0.9},
	}
	face, cocok, live, hidup := uc.nilaiBiometrik(context.Background(), "usr-1", KirimPresensi{
		FrameDataUrl: "data:image/jpeg;base64,eA==", FaceScore: 0.99, LivenessScore: 0.99,
	})
	if face != 0.61 || cocok || live != 0.9 || !hidup {
		t.Fatalf("skor dari klien tidak boleh mengalahkan AI: face=%v cocok=%v live=%v hidup=%v", face, cocok, live, hidup)
	}
}

func TestNilaiBiometrikProduksiGagalTertutup(t *testing.T) {
	kasus := []struct {
		nama   string
		enroll enrollEmbeddingUji
		face   port.FaceService
		frame  string
	}{
		{"frame kosong", enrollEmbeddingUji{vektor: []float64{1, 0}}, faceVerifyUji{skor: 1, hidup: 1}, ""},
		{"template tidak ada", enrollEmbeddingUji{}, faceVerifyUji{skor: 1, hidup: 1}, "data:image/jpeg;base64,eA=="},
		{"template gagal dibaca", enrollEmbeddingUji{err: errors.New("db")}, faceVerifyUji{skor: 1, hidup: 1}, "data:image/jpeg;base64,eA=="},
		{"AI gagal", enrollEmbeddingUji{vektor: []float64{1, 0}}, faceVerifyUji{err: errors.New("timeout")}, "data:image/jpeg;base64,eA=="},
	}
	for _, k := range kasus {
		t.Run(k.nama, func(t *testing.T) {
			uc := &PresensiUsecase{aiAktif: true, enroll: k.enroll, wajah: k.face}
			face, cocok, live, hidup := uc.nilaiBiometrik(context.Background(), "usr-1", KirimPresensi{
				FrameDataUrl: k.frame, FaceScore: 1, LivenessScore: 1,
			})
			if face != 0 || cocok || live != 0 || hidup {
				t.Fatalf("kegagalan AI harus menolak, dapat face=%v cocok=%v live=%v hidup=%v", face, cocok, live, hidup)
			}
		})
	}
}

func TestNilaiBiometrikMemakaiAmbangCosineMentah(t *testing.T) {
	for _, k := range []struct {
		skor  float64
		lolos bool
	}{{0.619, false}, {0.62, true}, {0.8, true}} {
		uc := &PresensiUsecase{
			aiAktif: true, ambangWajah: 0.62, ambangLiveness: 0.5,
			enroll: enrollEmbeddingUji{vektor: []float64{1, 0}},
			wajah:  faceVerifyUji{skor: k.skor, hidup: 0.7},
		}
		_, cocok, _, _ := uc.nilaiBiometrik(context.Background(), "usr-1", KirimPresensi{
			FrameDataUrl: "data:image/jpeg;base64,eA==",
		})
		if cocok != k.lolos {
			t.Errorf("cosine %.3f: cocok=%v, ingin %v", k.skor, cocok, k.lolos)
		}
	}
}

func TestGabungEmbeddingMendeteksiRataRataWajah(t *testing.T) {
	got, err := gabungEmbedding([][]float64{{1, 0, 0}, {0, 1, 0}, {1, 0, 0}})
	if err != nil {
		t.Fatal(err)
	}
	want := []float64{2 / math.Sqrt(5), 1 / math.Sqrt(5), 0}
	for i := range want {
		if math.Abs(got[i]-want[i]) > 1e-9 {
			t.Fatalf("template tidak mencerminkan seluruh sampel: %v", got)
		}
	}
}
