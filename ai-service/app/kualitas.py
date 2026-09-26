"""Pemeriksaan kualitas minimum foto wajah sebelum dipakai untuk enrollment."""
from __future__ import annotations

import numpy as np


def alasan_kualitas(matriks_rgb: np.ndarray, wajah: dict) -> str | None:
    """Tolak wajah terlalu kecil, gelap/terang, atau tidak fokus."""
    tinggi, lebar = matriks_rgb.shape[:2]
    x, y, w, h = wajah.get("kotak", (0, 0, 0, 0))
    x1, y1 = max(0, int(x)), max(0, int(y))
    x2, y2 = min(lebar, int(x + w)), min(tinggi, int(y + h))
    if x2 <= x1 or y2 <= y1:
        return "Posisi wajah tidak terbaca. Posisikan wajah di tengah bingkai."

    # Bingkai pendaftaran sudah dipotong ke oval tengah oleh klien. Batas
    # proporsi ini menolak wajah jauh/kecil tanpa mengunci resolusi kamera.
    if (y2 - y1) / tinggi < 0.22 or (x2 - x1) / lebar < 0.18:
        return "Wajah terlalu jauh. Dekatkan wajah ke kamera dan isi bingkai."

    wajah_rgb = matriks_rgb[y1:y2, x1:x2, :3].astype(np.float32)
    abu = wajah_rgb.mean(axis=2)
    terang = float(abu.mean())
    if terang < 40:
        return "Foto terlalu gelap. Tambahkan cahaya dari depan wajah."
    if terang > 220:
        return "Foto terlalu terang. Hindari cahaya kuat tepat di depan kamera."
    if float(abu.std()) < 18:
        return "Detail wajah kurang terlihat. Gunakan pencahayaan yang lebih merata."

    # Laplacian 4-tetangga, tanpa dependensi OpenCV. Varians rendah menandakan
    # citra sangat kabur; ambang konservatif menjaga kamera ponsel tetap lolos.
    if abu.shape[0] < 3 or abu.shape[1] < 3:
        return "Resolusi wajah terlalu kecil. Dekatkan wajah ke kamera."
    lap = (
        abu[1:-1, :-2] + abu[1:-1, 2:] + abu[:-2, 1:-1] + abu[2:, 1:-1]
        - 4 * abu[1:-1, 1:-1]
    )
    if float(lap.var()) < 12:
        return "Foto tidak fokus. Tahan kamera dan wajah tetap diam saat mengambil foto."
    return None
