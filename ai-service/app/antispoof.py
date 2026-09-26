
from PIL import Image
import io as _io
import numpy as np


def anti_spoof_sederhana(matriks_rgb: np.ndarray) -> tuple[float, str]:
    """Skor heuristik tekstur 0–1 dari satu citra (bukan model PAD).

    Ketajaman dan rentang intensitas hanya sinyal kasar: foto cetak/layar tertentu
    dapat lolos, sementara kamera asli dapat gagal. Skor ini tidak membuktikan
    bahwa orang hadir langsung di depan kamera dan tidak boleh disebut PAD kuat.
    """
    try:
        abu = matriks_rgb[..., :3].astype(np.float64).mean(axis=-1)
    except Exception:
        return 0.0, "citra-tidak-terbaca"
    h, w = abu.shape[:2]
    if h < 24 or w < 24:
        return 0.0, "citra-terlalu-kecil"
    # Ketajaman: varians Laplacian (kernel 3x3) pada citra yang dinormalkan.
    lap = (
        -4 * abu[1:-1, 1:-1]
        + abu[:-2, 1:-1]
        + abu[2:, 1:-1]
        + abu[1:-1, :-2]
        + abu[1:-1, 2:]
    )
    ketajaman = float(np.var(lap) / (float(np.var(abu)) + 1e-6))
    rentang = float(np.percentile(abu, 97) - np.percentile(abu, 3))
    # Kalibrasi longgar dari selfie ponsel: ketajaman nyata ~8–80,
    # foto/layar ulang biasanya < 3.
    skor_tajam = min(1.0, max(0.0, (ketajaman - 2.0) / 10.0))
    skor_rentang = min(1.0, max(0.0, (rentang - 18.0) / 60.0))
    skor = round(0.65 * skor_tajam + 0.35 * skor_rentang, 4)
    alasan = "tekstur-memadai" if skor >= 0.5 else "tekstur-tidak-memadai"
    return skor, alasan


def baca_gambar_rgb(mentah: np.ndarray) -> np.ndarray:
    """Decode byte gambar menjadi matriks RGB uint8 (PIL, tanpa OpenCV)."""
    with Image.open(_io.BytesIO(bytes(mentah.tobytes()))) as img:
        return np.asarray(img.convert("RGB"))
