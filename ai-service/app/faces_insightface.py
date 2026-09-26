"""
Provider InsightFace (ArcFace) — mesin wajah untuk produksi.

Memerlukan paket `insightface` + `onnxruntime` (lihat requirements.txt);
model buffalo_l diunduh otomatis pada pemakaian pertama ke ~/.insightface
(saat membangun image Docker model disalin ke dalam image agar luring).
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from app.faces import baca_gambar

log = logging.getLogger("ai.faces.insightface")


class PenyediaInsightFace:
    """Deteksi satu wajah + vektorisasi ArcFace 512-dimensi ternormalisasi L2."""

    nama = "insightface-buffalo_l"

    def __init__(self, nama_model: str = "buffalo_l", ukuran_det: int = 640) -> None:
        from insightface.app import FaceAnalysis  # impor lambat (berat)

        self._app = FaceAnalysis(name=nama_model, providers=["CPUExecutionProvider"])
        # ukuran layanan deteksi: cukup untuk bingkai selfie 320–640 px
        self._app.prepare(ctx_id=0, det_size=(ukuran_det, ukuran_det))
        self._nama_model = nama_model

    def deteksi(self, gambar: np.ndarray) -> Optional[dict]:
        """Kotak satu wajah; None bila tidak ada dan error bila wajah lebih dari satu."""
        wajah = self._wajah(gambar)
        if not wajah:
            return None
        x1, y1, x2, y2 = (float(v) for v in wajah.bbox)
        return {"kotak": (x1, y1, x2 - x1, y2 - y1)}

    def embedding(self, gambar: np.ndarray, _wajah: Optional[dict] = None) -> np.ndarray:
        """Vektor ArcFace 512-d; gagal-cepat bila jumlah wajah bukan satu."""
        wajah = self._wajah(gambar)
        if wajah is None:
            raise ValueError("Tidak ada wajah terdeteksi pada foto")
        vektor = np.asarray(wajah.normed_embedding, dtype=np.float64)
        log.debug("embedding model=%s dim=%d", self._nama_model, vektor.shape[0])
        return vektor

    # -- internal ---------------------------------------------------------

    def _wajah(self, gambar: np.ndarray):
        """Tolak foto tanpa tepat satu wajah; jangan pilih identitas secara ambigu."""
        matriks = baca_gambar(gambar)
        # InsightFace memakai urutan kanal BGR (konvensi OpenCV).
        bgr = np.ascontiguousarray(matriks[..., ::-1])
        hasil = self._app.get(bgr)
        if not hasil:
            return None
        if len(hasil) != 1:
            raise ValueError("Pastikan hanya satu wajah terlihat dalam bingkai")
        return hasil[0]
