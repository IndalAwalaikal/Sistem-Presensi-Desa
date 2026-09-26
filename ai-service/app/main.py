"""
Layanan AI — verifikasi wajah untuk Sistem Presensi Desa Anabanua.

FastAPI + provider wajah yang dapat dipertukarkan:
  - InsightFace (ArcFace buffalo_l) bila terpasang — produksi.
  - Provider demo deterministik (phash) bila model berat tidak tersedia —
    untuk pengembangan/uji pipeline tanpa unduhan model.

Kunci API wajib pada setiap permintaan: header X-API-Key == AI_API_KEY (env).
"""
from __future__ import annotations

import base64
import binascii
import logging
import os
import secrets
import re
from typing import List

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.faces import penyedia_wajah
from app.antispoof import anti_spoof_sederhana, baca_gambar_rgb
from app.kualitas import alasan_kualitas
from app.verification import embedding_sah, kemiripan_kosinus


logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ai")

app = FastAPI(title="Layanan Wajah — Presensi Anabanua", version="1.0.0")
penyedia = penyedia_wajah(os.environ.get("FACE_PROVIDER", "auto"))
log.info("penyedia wajah: %s", penyedia.nama)


def wajib_api_key(x_api_key: str = Header(default="")) -> None:
    """Kunci API dari env — gagal-cepat bila tidak diset saat mulai."""
    rahasia = os.environ.get("AI_API_KEY", "")
    if not rahasia:
        raise HTTPException(status_code=503, detail="AI_API_KEY belum diset di server")
    if not x_api_key or not secrets.compare_digest(x_api_key, rahasia):
        raise HTTPException(status_code=401, detail="Kunci API tidak sah")


class IsiEmbed(BaseModel):
    image: str = Field(..., description="Data URL gambar wajah (base64)")


class IsiVerify(BaseModel):
    image: str = Field(..., description="Data URL gambar yang diperiksa")
    reference: List[float] = Field(..., description="Vektor wajah referensi")


def data_url_ke_numpy(data_url: str) -> np.ndarray:
    """Pecah data URL data:image/...;base64,XXXX menjadi array byte mentah."""
    cocok = re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})", data_url)
    if not cocok:
        raise HTTPException(status_code=400, detail="Data URL tidak sah")
    payload = cocok.group(1)
    # Tolak payload yang mustahil muat dalam batas byte sebelum alokasi decode.
    if len(payload) > ((8 << 20) * 4 // 3 + 8):
        raise HTTPException(status_code=413, detail="Gambar terlalu besar (maks 8 MB)")
    try:
        mentah = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Base64 gambar tidak sah") from None
    if len(mentah) > 8 << 20:
        raise HTTPException(status_code=413, detail="Gambar terlalu besar (maks 8 MB)")
    # Kembalikan sebagai array 1-D byte — decode citra menjadi tugas provider
    # (JPEG/PNG perlu PIL; provider demo meng-decode sendiri).
    return np.frombuffer(mentah, dtype=np.uint8)


@app.get("/healthz")
def sehat() -> dict:
    return {"status": "ok", "provider": penyedia.nama}


@app.post("/embed", dependencies=[Depends(wajib_api_key)])
def embed(isi: IsiEmbed) -> dict:
    gambar = data_url_ke_numpy(isi.image)
    try:
        wajah = penyedia.deteksi(gambar)
        if wajah is None:
            raise HTTPException(status_code=422, detail="Tidak ada wajah terdeteksi pada foto")
        matriks_rgb = baca_gambar_rgb(gambar)
        alasan = alasan_kualitas(matriks_rgb, wajah)
        if alasan:
            raise HTTPException(status_code=422, detail=alasan)
        vektor = embedding_sah(penyedia.embedding(gambar, wajah))
    except (OSError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e) or "Foto wajah tidak dapat diperiksa") from None
    return {"embedding": [float(x) for x in vektor], "model": penyedia.nama}


@app.post("/verify", dependencies=[Depends(wajib_api_key)])
def verifikasi(isi: IsiVerify) -> dict:
    if len(isi.reference) == 0:
        raise HTTPException(status_code=400, detail="Referensi kosong")
    gambar = data_url_ke_numpy(isi.image)
    try:
        wajah = penyedia.deteksi(gambar)
        if wajah is None:
            raise HTTPException(status_code=422, detail="Tidak ada wajah terdeteksi pada foto")
        matriks_rgb = baca_gambar_rgb(gambar)
        alasan = alasan_kualitas(matriks_rgb, wajah)
        if alasan:
            raise HTTPException(status_code=422, detail=alasan)
        vektor = embedding_sah(penyedia.embedding(gambar, wajah))
    except (OSError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e) or "Foto wajah tidak dapat diperiksa") from None
    # Layanan hanya menghasilkan skor; ambang dan keputusan final berada di
    # backend agar tidak ada dua konfigurasi keputusan yang dapat berbeda.
    try:
        referensi = embedding_sah(np.asarray(isi.reference, dtype=np.float64))
        if referensi.shape != vektor.shape:
            raise ValueError("Dimensi embedding referensi tidak sesuai dengan model")
        skor = kemiripan_kosinus(vektor, referensi)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    # Anti-spoofing tekstur Laplacian & distribusi warna dari citra asli
    matriks_rgb = baca_gambar_rgb(gambar)
    skor_liveness, alasan_liveness = anti_spoof_sederhana(matriks_rgb)
    return {
        "score": round(float(skor), 4),
        "liveness_score": skor_liveness,
        "liveness_reason": alasan_liveness,
        "model": penyedia.nama,
    }
