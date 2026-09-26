"""
Provider wajah: pemilihan mesin deteksi & vektorisasi wajah.

Urutan prioritas (FACE_PROVIDER=auto):
  1. InsightFace (ArcFace) — produksi, memerlukan paket `insightface`.
  2. Provider demo (phash 64-bit) — deterministik, tanpa unduhan model;
     cukup numpy + Pillow untuk menguji seluruh pipeline.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import numpy as np

log = logging.getLogger("ai.faces")


def baca_gambar(gambar: np.ndarray) -> np.ndarray:
    """Ubah byte gambar (hasil `np.frombuffer`) menjadi matriks RGB (H, W, 3).

    Layanan menerima data URL base64; isinya didekode di sini agar setiap
    provider bekerja dengan bentuk yang sama. Melempar ValueError bila byte
    yang dikirim bukan citra yang dapat dibaca Pillow.
    """
    from io import BytesIO

    from PIL import Image

    if gambar.ndim == 3:  # sudah berupa matriks gambar
        return gambar
    try:
        img = Image.open(BytesIO(bytes(gambar)))
        lebar, tinggi = img.size
        if lebar < 64 or tinggi < 64:
            raise ValueError("Resolusi foto terlalu kecil untuk verifikasi wajah")
        if lebar * tinggi > 16_777_216:
            raise ValueError("Resolusi foto terlalu besar untuk diproses")
        img.load()
        return np.asarray(img.convert("RGB"), dtype=np.uint8).copy()
    except ValueError:
        raise
    except Exception as e:  # noqa: BLE001 — pesan seragam untuk klien
        raise ValueError("Byte gambar tidak dapat dibaca sebagai citra") from e



class PenyediaWajah:
    """Kontrak provider: deteksi posisi wajah + vektorisasi."""

    nama = "dasar"

    def deteksi(self, gambar: np.ndarray) -> Optional[dict]:
        """Kembalikan {'kotak': (x, y, w, h)} bila ada wajah, selain itu None."""
        raise NotImplementedError

    def embedding(self, gambar: np.ndarray, wajah: dict) -> np.ndarray:
        """Vektor wajah (1-D, ternormalisasi)."""
        raise NotImplementedError


def penyedia_wajah(mode: str) -> PenyediaWajah:
    """Pilih provider: insightface bila terpasang, selain itu demo terjaga."""
    if mode == "demo" and os.environ.get("APP_ENV", "").lower() == "production":
        raise RuntimeError("FACE_PROVIDER=demo dilarang pada APP_ENV=production")
    if mode == "demo":
        log.info("provider demo dipaksa lewat env FACE_PROVIDER=demo")
        return PenyediaDemo()

    try:
        from app.faces_insightface import PenyediaInsightFace  # impor lambat

        log.info("InsightFace siap")
        return PenyediaInsightFace()
    except Exception as e:  # noqa: BLE001 — fallback memang harus luas
        log.warning("InsightFace tidak tersedia (%s); memakai provider demo", e)
        if os.environ.get("APP_ENV", "").lower() == "production":
            raise RuntimeError(
                "Provider wajah produksi tidak tersedia; fallback demo dilarang di produksi"
            ) from e
        if mode == "auto" and os.environ.get("AI_PERBOLEHKAN_DEMO", "1") != "1":
            raise RuntimeError(
                "Model wajah produksi tidak tersedia dan fallback demo dinonaktifkan "
                "(AI_PERBOLEHKAN_DEMO=0)"
            ) from e
        return PenyediaDemo()


# ----------------------------------------------------------------------
# Provider demo — vektor tekstur abu-abu 16×16 (256 dimensi) yang sudah
# dinormalkan terhadap reratanya. Deterministik dan cepat; BUKAN biometrik
# sungguhan — hanya untuk menguji seluruh pipeline tanpa model ArcFace.
# ----------------------------------------------------------------------
class PenyediaDemo(PenyediaWajah):
    nama = "demo-tekstur"

    def deteksi(self, gambar: np.ndarray) -> Optional[dict]:
        matriks = self._ke_matriks(gambar)
        h, w = matriks.shape[:2]
        # Provider demo tidak mengenali wajah: seluruh bingkai dianggap wajah.
        return {"kotak": (0, 0, int(w), int(h))}

    def embedding(self, gambar: np.ndarray, _wajah: dict) -> np.ndarray:
        matriks = self._ke_matriks(gambar)
        abu = self._ke_abu(matriks)
        blok = self._kecil(abu, 16)
        # Selisih terhadap rerata: menghapus pengaruh kecerahan global sehingga
        # dua gambar berbeda tidak lagi berbobot sama hanya karena sama terang.
        vektor = (blok - float(blok.mean())).flatten().astype(np.float64)
        norma = float(np.linalg.norm(vektor))
        if norma == 0:  # gambar benar-benar rata: tidak ada tekstur untuk dinilai
            return np.zeros_like(vektor)
        return vektor / norma

    # -- internal ---------------------------------------------------------

    @staticmethod
    def _ke_matriks(gambar: np.ndarray) -> np.ndarray:
        """Decode byte gambar menjadi matriks RGB via pembaca bersama."""
        try:
            return baca_gambar(gambar)
        except ValueError:  # noqa: PERF203 — fallback: perlakukan sebagai abu mentah
            return gambar.reshape(1, -1)

    @staticmethod
    def _ke_abu(matriks: np.ndarray) -> np.ndarray:
        if matriks.ndim == 2:
            return matriks.astype(np.float64)
        return matriks[..., :3].astype(np.float64).mean(axis=-1)

    @staticmethod
    def _kecil(abu: np.ndarray, sisi: int) -> np.ndarray:
        """Turunkan resolusi ke `sisi`×`sisi` dengan rata-rata blok."""
        arr = abu.astype(np.float64)
        h, w = arr.shape[:2]
        bh, bw = max(1, h // sisi), max(1, w // sisi)
        arr = arr[: bh * sisi, : bw * sisi]
        return arr.reshape(sisi, bh, sisi, bw).mean(axis=(1, 3))
