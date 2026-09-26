import io
import unittest

import numpy as np
from PIL import Image

from app.faces import baca_gambar


class UjiBacaGambar(unittest.TestCase):
    def test_membaca_citra_rgb_valid(self):
        buffer = io.BytesIO()
        Image.new("RGB", (64, 64), color=(20, 80, 120)).save(buffer, format="PNG")
        hasil = baca_gambar(np.frombuffer(buffer.getvalue(), dtype=np.uint8))
        self.assertEqual(hasil.shape, (64, 64, 3))
        self.assertEqual(hasil.dtype, np.uint8)

    def test_menolak_resolusi_tidak_memadai(self):
        buffer = io.BytesIO()
        Image.new("RGB", (32, 32), color=(20, 80, 120)).save(buffer, format="PNG")
        with self.assertRaisesRegex(ValueError, "Resolusi foto terlalu kecil"):
            baca_gambar(np.frombuffer(buffer.getvalue(), dtype=np.uint8))


if __name__ == "__main__":
    unittest.main()
