# Layanan Wajah (AI) — Presensi Anabanua

Layanan Python (FastAPI) untuk vektorisasi & pencocokan wajah yang dipanggil
backend Go. Berdiri sendiri; satu-satunya antarmuka adalah HTTP + kunci API.

## Menjalankan

```bash
cd ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # isi AI_API_KEY (samakan dengan backend)
uvicorn app.main:app --host 127.0.0.1 --port 8100
```

Backend mengenali layanan ini lewat `AI_BASE_URL` + `AI_API_KEY` (lihat
`backend/.env.example`).

## Endpoint

| Metode | Jalur | Isi | Hasil |
|---|---|---|---|
| GET | `/healthz` | — | `{status, provider}` |
| POST | `/embed` | `{image: dataURL}` | `{embedding: [float], model}` |
| POST | `/verify` | `{image: dataURL, reference: [float]}` | `{score, liveness_score, liveness_reason, model}` |

Setiap permintaan wajib membawa header `X-API-Key`.

## Provider

- **InsightFace (ArcFace `buffalo_l`)** — produksi. Pasang dependensi opsional
  di `requirements.txt`; model diunduh otomatis pada pemakaian pertama.
- **Provider demo (`demo-tekstur`)** — deterministik, tanpa model; hanya untuk
  pengembangan/uji pipeline. `FACE_PROVIDER=demo` memaksanya. Saat
  `APP_ENV=production`, layanan menolak provider demo dan gagal mulai jika
  InsightFace tidak tersedia, terlepas dari nilai fallback.

`score` adalah cosine similarity mentah pada rentang -1 sampai 1. Backend
membandingkannya dengan `AMBANG_WAJAH`; ambang tetap perlu dikalibrasi dengan
sampel yang sah dan tidak sah dari perangkat serta kondisi kerja setempat.
Enrollment merata-ratakan embedding seluruh foto yang dikirim.

## Batas deteksi keaslian

`liveness_score` saat ini berasal dari heuristik tekstur satu gambar (ketajaman
dan rentang intensitas), bukan model Presentation Attack Detection (PAD) yang
teruji. Heuristik ini dapat salah menolak pengguna asli dan dapat dilewati oleh
foto/video tiruan tertentu. Jangan anggap skor ini sebagai jaminan liveness
atau perlindungan kuat dari spoofing. Sebelum mengandalkannya untuk keputusan
kepegawaian, uji false accept dan false reject dengan perangkat, pencahayaan,
dan variasi pengguna setempat; untuk perlindungan lebih kuat, ganti dengan PAD
multi-frame yang telah dievaluasi.
