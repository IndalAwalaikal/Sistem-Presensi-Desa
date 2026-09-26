"""Validasi embedding dan skor pencocokan yang dipakai API AI."""
from __future__ import annotations

import numpy as np


def embedding_sah(vektor: np.ndarray) -> np.ndarray:
    """Pastikan model/referensi menghasilkan vektor 1-D, finite, dan nonzero."""
    vektor = np.asarray(vektor, dtype=np.float64)
    if vektor.ndim != 1 or vektor.size < 2:
        raise ValueError("Embedding wajah tidak sah")
    if not np.all(np.isfinite(vektor)):
        raise ValueError("Embedding wajah berisi nilai tidak sah")
    with np.errstate(over="ignore", invalid="ignore"):
        norma = float(np.linalg.norm(vektor))
    if not np.isfinite(norma) or norma <= 1e-12:
        raise ValueError("Embedding wajah kosong")
    return vektor


def kemiripan_kosinus(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity mentah [-1, 1], tanpa pemetaan skala yang menyesatkan."""
    a = embedding_sah(a)
    b = embedding_sah(b)
    if a.shape != b.shape:
        raise ValueError("Dimensi embedding tidak sama")
    norma_a = float(np.linalg.norm(a))
    norma_b = float(np.linalg.norm(b))
    if norma_a <= 1e-12 or norma_b <= 1e-12:
        return 0.0
    return float(np.clip(float(np.dot(a / norma_a, b / norma_b)), -1.0, 1.0))
