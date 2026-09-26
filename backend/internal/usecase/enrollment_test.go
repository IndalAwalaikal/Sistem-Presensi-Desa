package usecase

import (
	"math"
	"testing"
)

func TestGabungEmbeddingMemakaiSemuaFotoDanMenormalisasi(t *testing.T) {
	hasil, err := gabungEmbedding([][]float64{{1, 0}, {0, 1}})
	if err != nil {
		t.Fatalf("gabung embedding: %v", err)
	}
	want := 1 / math.Sqrt(2)
	if math.Abs(hasil[0]-want) > 1e-9 || math.Abs(hasil[1]-want) > 1e-9 {
		t.Fatalf("rata-rata embedding tidak benar: %v", hasil)
	}
	if math.Abs(math.Hypot(hasil[0], hasil[1])-1) > 1e-9 {
		t.Fatalf("embedding hasil harus ternormalisasi: %v", hasil)
	}
}

func TestGabungEmbeddingMenolakSampelRusak(t *testing.T) {
	kasus := []struct {
		nama   string
		sampel [][]float64
	}{
		{"kosong", nil},
		{"dimensi beda", [][]float64{{1, 0}, {1, 0, 0}}},
		{"vektor nol", [][]float64{{0, 0}}},
		{"bukan angka", [][]float64{{1, math.NaN()}}},
		{"norma meluap", [][]float64{{1e308, 1e308}}},
	}
	for _, k := range kasus {
		t.Run(k.nama, func(t *testing.T) {
			if _, err := gabungEmbedding(k.sampel); err == nil {
				t.Fatal("embedding rusak seharusnya ditolak")
			}
		})
	}
}
