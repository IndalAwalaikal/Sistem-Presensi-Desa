import unittest

import numpy as np

from app.verification import kemiripan_kosinus


class UjiKemiripanKosinus(unittest.TestCase):
    def test_mengembalikan_cosine_mentah(self):
        self.assertAlmostEqual(kemiripan_kosinus(np.array([1.0, 0.0]), np.array([1.0, 0.0])), 1.0)
        self.assertAlmostEqual(kemiripan_kosinus(np.array([1.0, 0.0]), np.array([0.0, 1.0])), 0.0)
        self.assertAlmostEqual(kemiripan_kosinus(np.array([1.0, 0.0]), np.array([-1.0, 0.0])), -1.0)

    def test_menolak_dimensi_berbeda_vektor_nol_dan_non_finite(self):
        kasus = [
            (np.array([1.0, 0.0]), np.array([1.0, 0.0, 0.0])),
            (np.array([0.0, 0.0]), np.array([1.0, 0.0])),
            (np.array([np.nan, 1.0]), np.array([1.0, 0.0])),
            (np.array([1e308, 1e308]), np.array([1.0, 0.0])),
        ]
        for a, b in kasus:
            with self.subTest(a=a, b=b), self.assertRaises(ValueError):
                kemiripan_kosinus(a, b)


if __name__ == "__main__":
    unittest.main()
