#!/usr/bin/env python3
"""Uji end-to-end terpadu — Sistem Presensi Perangkat Desa Anabanua.

Menguji tiga komponen sekaligus melalui antarmuka publiknya:

  A. Layanan AI (Python)              — kunci API, /embed, /verify, ambang
  B. API Go: masuk, kewenangan, kerahasiaan
  C. Alur dokumen 6: undangan → aktivasi (sekali pakai, persetujuan biometrik)
  D. Pendaftaran wajah → verifikasi pengelola akun (biometrik aktif)
  E. Presensi datang & pulang: GPS geofence, verifikasi wajah AI, waktu server
  F. Perubahan jam kerja & lokasi kantor dari aplikasi + jejak audit
  G. Profil pemilik akun (kontak & kata sandi) + kontrak galat JSON /api/
  H. Rekap bulanan: hari tanpa presensi ikut dihitung (tanpa keterangan),
     jumlah kejadian sependapat dengan total durasinya

Tidak ada ketergantungan pihak ketiga (hanya pustaka standar Python 3.9+),
sehingga dapat dijalankan di mesin uji mana pun tanpa `pip install`.

Pemakaian:
    python3 scripts/e2e_terpadu.py
    API_BASE=http://127.0.0.1:8080/api AI_BASE=http://127.0.0.1:8100 \
        python3 scripts/e2e_terpadu.py

Keluar dengan kode 1 bila ada pemeriksaan yang GAGAL.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import random
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zlib
from datetime import date, datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Konfigurasi — dapat ditimpa lewat variabel lingkungan.
# ---------------------------------------------------------------------------

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get("API_BASE", "http://127.0.0.1:8080/api").rstrip("/")
AI = os.environ.get("AI_BASE", "http://127.0.0.1:8100").rstrip("/")
WITA = timezone(timedelta(hours=8))


def baca_env(jalur: str, kunci: str) -> str:
    """Ambil nilai dari berkas .env (tanpa mengubah lingkungan proses)."""
    try:
        with open(jalur, "r", encoding="utf-8") as f:
            for baris in f:
                baris = baris.strip()
                if baris.startswith(kunci + "="):
                    return baris.split("=", 1)[1].strip()
    except OSError:
        pass
    return ""


AI_KEY = os.environ.get("AI_API_KEY") or baca_env(
    os.path.join(AKAR, "ai-service", ".env"), "AI_API_KEY"
)
ENV_BACKEND = os.path.join(AKAR, "backend", ".env")
KADES_EMAIL = baca_env(ENV_BACKEND, "SEED_KEPALA_EMAIL") or "kepala@anabanua.id"
KADES_SANDI = baca_env(ENV_BACKEND, "SEED_KEPALA_SANDI")
SEKRE_EMAIL = baca_env(ENV_BACKEND, "SEED_SEKRETARIS_EMAIL") or "sekretaris@anabanua.id"
SEKRE_SANDI = baca_env(ENV_BACKEND, "SEED_SEKRETARIS_SANDI")
KANTOR_LAT = float(baca_env(ENV_BACKEND, "KANTOR_LAT") or -4.4680072)
KANTOR_LNG = float(baca_env(ENV_BACKEND, "KANTOR_LNG") or 119.713862)

# ---------------------------------------------------------------------------
# Kerangka pemeriksaan
# ---------------------------------------------------------------------------

LULUS = 0
GAGAL = 0
LEWAT = 0
CATATAN_GAGAL: list[str] = []


def ok(nama: str, kondisi: bool, detail=None) -> bool:
    global LULUS, GAGAL
    if kondisi:
        LULUS += 1
        print(f"  LULUS  {nama}")
    else:
        GAGAL += 1
        CATATAN_GAGAL.append(nama)
        print(f"  GAGAL  {nama} | {detail!r}"[:600])
    return bool(kondisi)


def lewati(nama: str, alasan: str) -> None:
    global LEWAT
    LEWAT += 1
    print(f"  LEWAT  {nama} | {alasan}")


def cek(nama: str) -> None:
    print(f"  -> {nama}")


def req(metode: str, url: str, isi=None, token: str | None = None, header: dict | None = None):
    """Permintaan HTTP → (status, badan_json_atau_teks, header)."""
    data = None
    h = {"Accept": "application/json"}
    if isi is not None:
        data = json.dumps(isi).encode()
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = "Bearer " + token
    if header:
        h.update(header)
    r = urllib.request.Request(url, data=data, headers=h, method=metode)
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            mentah = res.read().decode("utf-8", "replace")
            kode = res.status
            kepala = dict(res.headers)
    except urllib.error.HTTPError as e:
        mentah = e.read().decode("utf-8", "replace")
        kode = e.code
        kepala = dict(e.headers)
    except urllib.error.URLError as e:
        return 0, {"pesan": f"tidak terjangkau: {e.reason}"}, {}
    try:
        return kode, json.loads(mentah), kepala
    except ValueError:
        return kode, mentah, kepala


# ---------------------------------------------------------------------------
# Gambar uji — PNG dibuat sendiri (tanpa Pillow) agar skrip tetap mandiri.
# Tekstur berbeda = "orang berbeda" bagi provider tekstur; bagi model nyata
# (ArcFace) gambar sintetis tidak mengandung wajah, sehingga uji yang
# membutuhkannya dilewati kecuali tersedia foto contoh di scripts/fixtures/wajah.
# ---------------------------------------------------------------------------


def _chunk(tipe: bytes, isi: bytes) -> bytes:
    return (
        struct.pack(">I", len(isi))
        + tipe
        + isi
        + struct.pack(">I", binascii.crc32(tipe + isi) & 0xFFFFFFFF)
    )


def png_acak(benih: int, sisi: int = 96, blok: int = 8) -> bytes:
    """PNG RGB `sisi`×`sisi` berpola blok kasar deterministik.

    Pola kasar (bukan derau per piksel) dipakai agar tekstur tetap terbaca
    setelah gambar diperkecil — provider demo menilai tekstur, bukan wajah.
    """
    rng = random.Random(benih)
    n = max(2, sisi // blok)
    nilai = [[rng.randrange(256) for _ in range(n)] for _ in range(n)]
    baris = bytearray()
    for y in range(sisi):
        baris.append(0)  # filter baris: none
        for x in range(sisi):
            v = nilai[(y * n) // sisi][(x * n) // sisi]
            baris += bytes(((v + x // 2) % 256, (v * 3 + y) % 256, (v * 5 + x) % 256))
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", sisi, sisi, 8, 2, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(baris), 9))
        + _chunk(b"IEND", b"")
    )


def data_url(isi: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64," + base64.b64encode(isi).decode()


GAMBAR_A = data_url(png_acak(11))
GAMBAR_A2 = data_url(png_acak(11))  # identik dengan A
GAMBAR_B = data_url(png_acak(29))  # tekstur lain → "orang lain"

# Foto orang sungguhan — hanya diunduh saat uji memakai model ArcFace (tidak
# disimpan di repositori). Berkas contoh dari proyek face_recognition (lisensi
# MIT, potret resmi pemerintah AS = domain publik).
DIR_BENIH_WAJAH = os.environ.get(
    "UJI_WAJAH_DIR", os.path.join(tempfile.gettempdir(), "anabanua-uji-wajah")
)
SUMBER_WAJAH_A = os.environ.get(
    "UJI_WAJAH_A",
    "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/obama.jpg",
)
SUMBER_WAJAH_B = os.environ.get(
    "UJI_WAJAH_B",
    "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/biden.jpg",
)

# Diisi oleh muat_wajah_nyata(): True bila GAMBAR_A/GAMBAR_B berisi wajah nyata.
WAJAH_SIAP = False


def muat_wajah_nyata() -> bool:
    """Unduh dua potret berbeda ke cache sementara; kembalikan keberhasilannya."""
    global GAMBAR_A, GAMBAR_A2, GAMBAR_B, WAJAH_SIAP
    os.makedirs(DIR_BENIH_WAJAH, exist_ok=True)
    hasil: list[str] = []
    for nama, sumber in (("orang-a.jpg", SUMBER_WAJAH_A), ("orang-b.jpg", SUMBER_WAJAH_B)):
        jalur = os.path.join(DIR_BENIH_WAJAH, nama)
        if not os.path.exists(jalur):
            try:
                permintaan = urllib.request.Request(
                    sumber, headers={"User-Agent": "uji-e2e-anabanua/1.0"}
                )
                with urllib.request.urlopen(permintaan, timeout=45) as res:
                    data = res.read()
                if len(data) < 5000:
                    raise ValueError(f"berkas terlalu kecil ({len(data)} bait)")
                with open(jalur, "wb") as f:
                    f.write(data)
            except (urllib.error.URLError, OSError, ValueError) as e:
                print(f"     (foto wajah {nama} tidak dapat diunduh: {e})")
                return False
        with open(jalur, "rb") as f:
            hasil.append(data_url(f.read(), "image/jpeg"))
    if len(hasil) == 2:
        GAMBAR_A, GAMBAR_B = hasil
        GAMBAR_A2 = GAMBAR_A  # salinan identik untuk uji determinisme A6
        WAJAH_SIAP = True
        return True
    return False

# ---------------------------------------------------------------------------
# A. Layanan AI
# ---------------------------------------------------------------------------


def kenali_provider() -> tuple[int, object, str, bool]:
    """Baca /healthz layanan AI: (status, isi, nama provider, model nyata?)."""
    kode, hz, _ = req("GET", AI + "/healthz")
    provider = hz.get("provider", "") if isinstance(hz, dict) else ""
    return kode, hz, provider, provider.startswith("insightface")


def bagian_a() -> tuple[str, bool]:
    kode_hz, hz, provider, nyata = kenali_provider()
    print("\n=== A. LAYANAN AI (Python) ===")
    ok(
        "A1 /healthz menjawab status ok",
        kode_hz == 200 and isinstance(hz, dict) and hz.get("status") == "ok",
        [kode_hz, hz],
    )
    print(f"     provider aktif: {provider or '(tidak diketahui)'}")

    if not AI_KEY:
        ok("A2 kunci API tersedia dari ai-service/.env", False, "AI_API_KEY kosong")
        return provider, nyata

    # Bila model wajah sungguhan aktif, gambar sintetis tidak mengandung wajah:
    # unduh dua potret berbeda agar A5–A8 dan D–F teruji penuh.
    if nyata and not WAJAH_SIAP:
        print("     model nyata terdeteksi: mengunduh foto wajah uji …")
        if muat_wajah_nyata():
            print("     foto wajah uji siap (obama vs biden, domain publik/MIT)")
        else:
            print("     (unduhan foto gagal — uji biometrik akan dilewati)")

    hdr = {"X-API-Key": AI_KEY}
    kode, isi, _ = req("POST", AI + "/embed", {"image": GAMBAR_A})
    ok("A2 /embed tanpa kunci API ditolak 401", kode == 401, [kode, isi])

    kode, isi, _ = req(
        "POST", AI + "/embed", {"image": GAMBAR_A}, header={"X-API-Key": "salah"}
    )
    ok("A3 /embed dengan kunci API salah ditolak 401", kode == 401, [kode, isi])

    kode, isi, _ = req("POST", AI + "/embed", {"image": "bukan-data-url"}, header=hdr)
    ok("A4 /embed menolak isi yang bukan data URL gambar", kode == 400, [kode, isi])

    kode, e1, _ = req("POST", AI + "/embed", {"image": GAMBAR_A}, header=hdr)
    tersedia = kode == 200 and isinstance(e1, dict) and len(e1.get("embedding") or []) > 0
    if not tersedia:
        lewati(
            "A5–A8 vektorisasi wajah",
            f"gambar uji tidak dapat divektorisasi (kode {kode}); sediakan foto wajah "
            "nyata lewat UJI_WAJAH_DIR agar bagian ini teruji",
        )
        return provider, nyata
    ok("A5 /embed mengembalikan vektor wajah", tersedia, [kode, str(e1)[:200]])

    kode, e2, _ = req("POST", AI + "/embed", {"image": GAMBAR_A2}, header=hdr)
    ok(
        "A6 vektorisasi deterministik (gambar sama → vektor sama)",
        kode == 200 and e1.get("embedding") == (e2 or {}).get("embedding"),
        kode,
    )

    kode, v1, _ = req(
        "POST", AI + "/verify", {"image": GAMBAR_A, "reference": e1["embedding"]}, header=hdr
    )
    ok(
        "A7 /verify gambar sama → skor tinggi & cocok",
        kode == 200 and v1.get("score", 0) >= 0.95,
        [kode, v1],
    )

    kode, e3, _ = req("POST", AI + "/embed", {"image": GAMBAR_B}, header=hdr)
    if kode == 200 and (e3 or {}).get("embedding"):
        kode, v2, _ = req(
            "POST", AI + "/verify", {"image": GAMBAR_B, "reference": e1["embedding"]}, header=hdr
        )
        ok(
            "A8 /verify gambar berbeda → skor lebih rendah & tidak cocok",
            kode == 200 and v2.get("score", 1) < v1.get("score", 0) and not v2.get("match"),
            [kode, v2],
        )
    else:
        lewati("A8 /verify gambar berbeda", f"gambar kedua tidak dapat divektorisasi (kode {kode})")

    kode, v3, _ = req("POST", AI + "/verify", {"image": GAMBAR_A, "reference": []}, header=hdr)
    ok("A9 /verify menolak referensi kosong", kode == 400, [kode, v3])
    return provider, nyata

# ---------------------------------------------------------------------------
# Alat bantu alur (dipakai bagian C–F)
# ---------------------------------------------------------------------------


def sekarang_wita() -> datetime:
    return datetime.now(WITA)


def hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def email_uji(label: str) -> str:
    """Email uji berakhiran domain khusus agar mudah dibersihkan."""
    return f"uji-{label}-{int(time.time() * 1000)}-{os.getpid()}-{random.randint(1000, 9999)}@uji.anabanua.id"


def nip_uji() -> str:
    """NIP/NIK unik per akun uji — kolom nip UNIQUE, nilai tetap menabrak 409."""
    return f"{random.randint(10**15, 10**16 - 1):016d}"


def masuk(email: str, sandi: str):
    kode, isi, _ = req("POST", API + "/auth/login", {"email": email, "password": sandi})
    token = (isi or {}).get("token") if isinstance(isi, dict) else None
    return kode, isi, token


def ada_kunci_rahasia(obj) -> list[str]:
    """Cari nama kunci yang membocorkan kredensial pada balasan JSON."""
    ditemukan: list[str] = []
    terlarang = ("hash", "password", "sandi")

    def telusuri(x, jalur: str) -> None:
        if isinstance(x, dict):
            for k, v in x.items():
                if any(t in k.lower() for t in terlarang):
                    ditemukan.append(f"{jalur}.{k}")
                telusuri(v, f"{jalur}.{k}")
        elif isinstance(x, list):
            for i, v in enumerate(x[:3]):
                telusuri(v, f"{jalur}[{i}]")

    telusuri(obj, "$")
    return ditemukan


def daftar_pengguna(admin_token: str):
    kode, isi, _ = req("GET", API + "/admin/pengguna", token=admin_token)
    return kode, isi if isinstance(isi, list) else []


def pengguna_oleh_email(admin_token: str, email: str):
    _, daftar = daftar_pengguna(admin_token)
    for u in daftar:
        if u.get("email") == email:
            return u
    return None


def audit_aksi(admin_token: str) -> list[str]:
    kode, isi, _ = req("GET", API + "/admin/audit", token=admin_token)
    if kode != 200 or not isinstance(isi, list):
        return []
    return [a.get("action", "") for a in isi]


# ---------------------------------------------------------------------------
# B. Autentikasi, kewenangan, kerahasiaan
# ---------------------------------------------------------------------------


def bagian_b() -> tuple[str, str]:
    print("\n=== B. AUTENTIKASI, KEWENANGAN, KERAHASIAAN ===")
    if not KADES_SANDI or not SEKRE_SANDI:
        ok("B0 kata sandi akun seed terbaca dari backend/.env", False,
           "SEED_KEPALA_SANDI/SEED_SEKRETARIS_SANDI kosong")
        return "", ""

    kode, isi, tok_kades = masuk(KADES_EMAIL, KADES_SANDI)
    peran = (isi or {}).get("pengguna", {}).get("role") if isinstance(isi, dict) else None
    ok(
        "B1 masuk kepala desa → peran KEPALA_DESA dari basis data",
        kode == 200 and bool(tok_kades) and peran == "KEPALA_DESA",
        [kode, peran],
    )

    kode, isi, tok_sekre = masuk(SEKRE_EMAIL, SEKRE_SANDI)
    peran = (isi or {}).get("pengguna", {}).get("role") if isinstance(isi, dict) else None
    ok(
        "B2 masuk sekretaris desa → peran SEKRETARIS_DESA",
        kode == 200 and bool(tok_sekre) and peran == "SEKRETARIS_DESA",
        [kode, peran],
    )

    kode, isi_salah, _ = req(
        "POST", API + "/auth/login", {"email": KADES_EMAIL, "password": KADES_SANDI + "x"}
    )
    ok("B3 kata sandi salah ditolak 401", kode == 401, [kode, isi_salah])

    kode, isi_hantu, _ = req(
        "POST", API + "/auth/login", {"email": "tidak-ada@uji.anabanua.id", "password": "SalahSekali123"}
    )
    pesan_sama = (
        isinstance(isi_salah, dict)
        and isinstance(isi_hantu, dict)
        and isi_salah.get("pesan") == isi_hantu.get("pesan")
    )
    ok("B4 akun tak dikenal tidak dapat dibedakan dari sandi salah", kode == 401 and pesan_sama,
       [kode, isi_hantu])

    kode, isi, _ = req("GET", API + "/auth/saya")
    ok("B5 /auth/saya tanpa token ditolak 401", kode == 401, kode)

    kode, isi, _ = req("GET", API + "/auth/saya", token="token.palsu.sekali")
    ok("B6 /auth/saya dengan token palsu ditolak 401", kode == 401, kode)

    kode, isi, _ = req("GET", API + "/auth/saya", token=tok_kades or "")
    ok(
        "B7 /auth/saya dengan sesi sah mengembalikan pengguna yang benar",
        kode == 200 and isinstance(isi, dict) and isi.get("email") == KADES_EMAIL,
        [kode, isi],
    )

    kebocoran = ada_kunci_rahasia(isi)
    kode_p, daftar = daftar_pengguna(tok_kades or "")
    kebocoran += ada_kunci_rahasia(daftar)
    ok(
        "B8 balasan API tidak memuat hash/kata sandi",
        kode_p == 200 and not kebocoran,
        kebocoran,
    )

    kode, _, _ = req("POST", API + "/auth/logout", {}, token=tok_sekre or "")
    kode_sesudah, isi_sesudah, _ = req("GET", API + "/auth/saya", token=tok_sekre or "")
    ok(
        "B9 keluar membatalkan sesi di sisi server (jti dicabut)",
        kode in (200, 204) and kode_sesudah == 401,
        [kode, kode_sesudah, isi_sesudah],
    )
    # Token sekretaris sudah dicabut oleh B9 — masuk kembali agar bagian C dst
    # memakai sesi yang sah (sebelumnya memakai token logout → 401/500 beruntun).
    kode, isi, tok_sekre = masuk(SEKRE_EMAIL, SEKRE_SANDI)
    ok("B10 masuk kembali setelah keluar (sesi baru untuk bagian C–F)",
       kode == 200 and bool(tok_sekre), kode)
    return tok_kades or "", tok_sekre or ""

# ---------------------------------------------------------------------------
# C. Registrasi perangkat desa: undangan → aktivasi (dokumen §6)
# ---------------------------------------------------------------------------


def buat_perangkat(admin_token: str, label: str, sandi: str | None = None) -> dict:
    """Sekretaris desa membuat akun perangkat + kode undangan sekali pakai."""
    email = email_uji(label)
    sandi = sandi or f"Uji{label.upper()}Anabanua123"
    # NIP/NIK unik per akun uji — kolom nip UNIQUE; NIP tetap di skrip E2E lama
    # menyebabkan 409 bila akun uji terdahulu belum dibersihkan.
    angka = "".join(str(b) for b in hashlib.sha256(email.encode()).digest()[:9])
    nip = "9" + angka[-17:].rjust(17, "0")
    kode, isi, _ = req(
        "POST",
        API + "/admin/pengguna",
        {
            "fullName": f"Perangkat Uji {label.upper()}",
            "email": email,
            "role": "PERANGKAT_DESA",
            "employeeId": nip,
            "position": "Staf Desa",
            "unit": "Pemerintah Desa",
            "phoneNumber": "",
            "address": "",
        },
        token=admin_token,
    )
    user = (isi or {}).get("user") or {}
    und = (isi or {}).get("undangan") or {}
    return {
        "email": email,
        "sandi": sandi,
        "nip": nip,
        "label": label,
        "kode_http": kode,
        "userId": user.get("id"),
        "pengguna": user,
        "undangan": und,
        "kode": und.get("kode"),
        "token": None,
    }


def aktifkan(akun: dict, nomor: str = "081234567890"):
    return req(
        "POST",
        API + "/aktivasi/" + (akun.get("kode") or "KOSONG"),
        {
            "password": akun["sandi"],
            "phoneNumber": nomor,
            "address": "Dusun Anabanua",
            "consentBiometrik": True,
        },
    )


def bagian_c(admin_token: str) -> tuple[dict, str]:
    print("\n=== C. REGISTRASI PERANGKAT DESA (ALUR DOKUMEN 6) ===")
    akun = buat_perangkat(admin_token, "c")
    ok(
        "C1 sekretaris membuat akun perangkat + kode undangan",
        akun["kode_http"] == 200 and bool(akun["kode"]) and bool(akun["userId"]),
        [akun["kode_http"], akun["pengguna"], akun["undangan"]],
    )
    ok(
        "C2 akun baru berstatus UNDANGAN dan biometrik NOT_ENROLLED",
        akun["pengguna"].get("accountStatus") == "UNDANGAN"
        and akun["pengguna"].get("biometricStatus") == "NOT_ENROLLED",
        akun["pengguna"],
    )

    kode_und = akun["kode"] or ""
    pola = len(kode_und) == 13 and kode_und.startswith("ANB-") and kode_und[8] == "-"
    kiri, kanan = (kode_und[4:8], kode_und[9:13]) if pola else ("", "")
    ok("C3 format kode ANB-XXXX-XXXX", pola, kode_und)
    ok(
        "C4 kedua kelompok kode berbeda (regresi: dulu selalu kembar)",
        kiri != "" and kiri != kanan,
        kode_und,
    )

    kode, isi, _ = req("GET", API + "/aktivasi/" + kode_und)
    ok(
        "C5 halaman aktivasi mengenali kode & menampilkan pemiliknya",
        kode == 200 and isinstance(isi, dict) and isi.get("email") == akun["email"],
        [kode, isi],
    )

    kode, isi, _ = req("GET", API + "/aktivasi/ANB-ZZZZ-ZZZZ")
    ok("C6 kode tak dikenal tidak membocorkan data (null)", kode == 200 and isi is None, [kode, isi])

    kode, isi, _ = req(
        "POST",
        API + "/aktivasi/" + kode_und,
        {"password": "SandiPanjang123", "phoneNumber": "081234567890", "consentBiometrik": False},
    )
    ok("C7 aktivasi tanpa persetujuan biometrik ditolak", kode == 400, [kode, isi])

    kode, isi, _ = req(
        "POST",
        API + "/aktivasi/" + kode_und,
        {"password": "pendek", "phoneNumber": "081234567890", "consentBiometrik": True},
    )
    ok("C8 kata sandi kurang dari 8 karakter ditolak", kode == 400, [kode, isi])

    kode, isi, _ = req(
        "POST",
        API + "/aktivasi/" + kode_und,
        {"password": "SandiPanjang123", "phoneNumber": "  ", "consentBiometrik": True},
    )
    ok("C9 nomor telepon kosong ditolak", kode == 400, [kode, isi])

    kode, isi, _ = aktifkan(akun)
    akun["token"] = (isi or {}).get("token") if isinstance(isi, dict) else None
    pengguna = (isi or {}).get("pengguna") or {}
    ok(
        "C10 aktivasi berhasil: akun AKTIF, biometrik belum terdaftar, sesi terbuka",
        kode == 200
        and bool(akun["token"])
        and pengguna.get("accountStatus") == "AKTIF"
        and pengguna.get("biometricStatus") == "NOT_ENROLLED",
        [kode, pengguna],
    )
    ok(
        "C11 persetujuan biometrik tercatat waktunya",
        bool(pengguna.get("biometricConsentAt")),
        pengguna.get("biometricConsentAt"),
    )

    kode, isi, _ = req(
        "POST",
        API + "/aktivasi/" + kode_und,
        {"password": "SandiLain123", "phoneNumber": "081234567890", "consentBiometrik": True},
    )
    ok("C12 kode undangan sekali pakai (dipakai ulang ditolak)", kode >= 400, [kode, isi])

    kode, isi, tok = masuk(akun["email"], akun["sandi"])
    ok("C13 masuk memakai kata sandi yang ditetapkan saat aktivasi", kode == 200 and bool(tok), [kode, isi])

    kode, isi, _ = req("GET", API + "/admin/pengguna", token=akun["token"] or "")
    ok("C14 perangkat desa tidak boleh membuka endpoint pengelola (403)", kode == 403, [kode, isi])

    kode, isi, _ = req("GET", API + "/aktivasi/" + kode_und)
    # Kode yang sudah dipakai tetap terbaca dengan penanda `dipakaiPada`:
    # halaman aktivasi memakainya untuk menjelaskan alasannya (samarkanEmail +
    # pesanKodeTidakSah di frontend) — bukan null seperti kode tak dikenal.
    ok(
        "C15 kode gugur setelah dipakai ditandai dipakaiPada (bukan null)",
        kode == 200
        and isinstance(isi, dict)
        and bool(isi.get("dipakaiPada"))
        and isi.get("userId") == akun["userId"],
        [kode, isi],
    )

    aksi = audit_aksi(admin_token)
    ok(
        "C16 jejak audit mencatat pembuatan akun & aktivasi",
        "MEMBUAT_AKUN" in aksi and "MENGAKTIFKAN_AKUN" in aksi,
        sorted(set(aksi))[:12],
    )

    # Regresi: NIP/NIK & email berkolom UNIQUE. Sebelumnya galat MySQL 1062
    # bocor sebagai 500; sekarang harus 409 dengan pesan ramah.
    kode, isi, _ = req(
        "POST",
        API + "/admin/pengguna",
        {
            "fullName": "Perangkat NIP Kembar",
            "email": email_uji("dup-nip"),
            "role": "PERANGKAT_DESA",
            "employeeId": akun["nip"],
            "position": "Staf Desa",
            "unit": "Pemerintah Desa",
        },
        token=admin_token,
    )
    ok(
        "C17 NIP/NIK yang sudah dipakai ditolak 409 (bukan 500)",
        kode == 409 and "NIP" in ((isi or {}).get("pesan") or ""),
        [kode, isi],
    )

    kode, isi, _ = req(
        "POST",
        API + "/admin/pengguna",
        {
            "fullName": "Perangkat Email Kembar",
            "email": akun["email"],
            "role": "PERANGKAT_DESA",
            "employeeId": "9" + "7" * 17,
            "position": "Staf Desa",
            "unit": "Pemerintah Desa",
        },
        token=admin_token,
    )
    ok(
        "C18 email yang sudah dipakai ditolak 409 (bukan 500)",
        kode == 409 and bool((isi or {}).get("pesan")),
        [kode, isi],
    )
    return akun, admin_token

# ---------------------------------------------------------------------------
# Alat bantu: presensi & pendaftaran wajah
# ---------------------------------------------------------------------------


def titik_kantor(admin_token: str) -> dict:
    kode, cfg, _ = req("GET", API + "/konfigurasi", token=admin_token)
    kantor = (cfg or {}).get("office") or {}
    titik = kantor.get("point") or {}
    return {
        "ok": kode == 200,
        "cfg": cfg or {},
        "nama": kantor.get("name"),
        "radius": kantor.get("radiusMeters"),
        "lat": titik.get("latitude"),
        "lng": titik.get("longitude"),
        "jadwal": (cfg or {}).get("schedule") or {},
        "akurasi_maks": (cfg or {}).get("maxAccuracyMeters"),
    }


def geser(lat: float, lng: float, meter: float) -> tuple[float, float]:
    """Geser titik sejauh `meter` ke utara (1° lintang ≈ 111.320 m)."""
    return lat + meter / 111_320.0, lng


def kirim_presensi(token: str, jenis: str, lat: float, lng: float, frame: str,
                   akurasi: float = 10.0, skor_wajah: float = 0.99,
                   hidup: float = 0.9) -> tuple[int, dict]:
    kode, isi, _ = req(
        "POST",
        API + "/presensi",
        {
            "type": jenis,
            "mode": "WFO",
            "faceScore": skor_wajah,
            "livenessScore": hidup,
            "location": {"latitude": lat, "longitude": lng},
            "accuracyMeters": akurasi,
            "frameDataUrl": frame,
        },
        token=token,
    )
    return kode, isi if isinstance(isi, dict) else {}


def foto_uji(jumlah: int = 3, benih: int = 11) -> list[dict]:
    # Bila foto wajah nyata sudah diunduh (GAMBAR_A), pakai foto itu untuk
    # bingkai enrollment — model ArcFace menolak gambar sintetis tanpa wajah.
    # Jumlah bingkai tetap ditepati agar batas minimum foto benar-benar teruji.
    if WAJAH_SIAP and GAMBAR_A.startswith("data:image/jpeg"):
        return [
            {"dataUrl": GAMBAR_A, "quality": 0.97,
             "capturedAt": datetime.now(WITA).isoformat()}
            for _ in range(jumlah)
        ]
    foto = []
    for i in range(jumlah):
        url = data_url(png_acak(benih + i * 37))
        foto.append(
            {"dataUrl": url, "quality": 0.92, "capturedAt": datetime.now(WITA).isoformat()}
        )
    return foto


def kirim_enrollment(token: str, user_id: str, jumlah: int = 3, benih: int = 11):
    kode, isi, _ = req(
        "POST",
        API + "/enrollment",
        {"userId": user_id, "photos": foto_uji(jumlah, benih)},
        token=token,
    )
    return kode, isi if isinstance(isi, dict) else {}


def siapkan_terverifikasi(admin_token: str, label: str, benih: int = 11) -> dict:
    """Buat → aktivasi → daftar wajah → setujui pengelola akun."""
    akun = buat_perangkat(admin_token, label)
    kode, isi, _ = aktifkan(akun)
    akun["token"] = (isi or {}).get("token")
    kode, enr = kirim_enrollment(akun["token"] or "", akun["userId"] or "", 3, benih)
    akun["enrollment"] = enr
    if kode == 200 and enr.get("id"):
        req("POST", API + "/admin/enrollment/" + enr["id"] + "/putuskan",
            {"approve": True, "note": "Uji otomatis"}, token=admin_token)
    return akun


def biometrik_sekarang(token: str) -> str:
    kode, isi, _ = req("GET", API + "/auth/saya", token=token)
    return (isi or {}).get("biometricStatus", "") if kode == 200 else f"HTTP {kode}"


# ---------------------------------------------------------------------------
# D. Pendaftaran wajah → verifikasi pengelola akun
# ---------------------------------------------------------------------------


def bagian_d(admin_token: str, akun: dict, ai_nyata: bool) -> dict:
    print("\n=== D. PENDAFTARAN WAJAH & VERIFIKASI PENGELOLA AKUN ===")
    tok = akun["token"] or ""
    cfg = titik_kantor(admin_token)
    if not cfg["ok"]:
        ok("D0 konfigurasi kantor & jadwal terbaca", False, cfg)

    kode, isi = kirim_presensi(
        tok, "CHECK_IN", cfg["lat"] or 0.0, cfg["lng"] or 0.0, GAMBAR_A
    )
    ok(
        "D1 presensi ditolak selama biometrik belum aktif",
        kode == 200 and isi.get("accepted") is False
        and (isi.get("rejection") or {}).get("code") == "BIOMETRIC_INACTIVE",
        [kode, isi],
    )

    kode, isi = kirim_enrollment(tok, akun["userId"], 2)
    ok("D2 pendaftaran wajah dengan 2 foto ditolak (minimal 3)", kode == 400, [kode, isi])

    kode, enr = kirim_enrollment(tok, akun["userId"], 3)
    if ai_nyata and not WAJAH_SIAP and kode >= 400:
        lewati(
            "D3+ pendaftaran wajah",
            "model wajah aktif tetapi tidak ada foto wajah uji (UJI_WAJAH_DIR)",
        )
        return akun
    ok(
        "D3 pendaftaran wajah dengan 3 foto tersimpan sebagai SUBMITTED",
        kode == 200 and enr.get("status") == "SUBMITTED",
        [kode, enr],
    )
    akun["enrollment"] = enr
    ok(
        "D4 status biometrik pengguna menjadi PENDING_VERIFICATION",
        biometrik_sekarang(tok) == "PENDING_VERIFICATION",
        biometrik_sekarang(tok),
    )

    kode, daftar, _ = req("GET", API + "/admin/enrollment/menunggu", token=admin_token)
    menunggu = [e for e in (daftar if isinstance(daftar, list) else []) if e.get("id") == enr.get("id")]
    ok("D5 pengajuan wajah muncul di antrean pengelola akun", kode == 200 and len(menunggu) == 1, kode)

    kode, putus, _ = req(
        "POST",
        API + "/admin/enrollment/" + (enr.get("id") or "") + "/putuskan",
        {"approve": True, "note": "Wajah jelas (uji otomatis)"},
        token=admin_token,
    )
    ok(
        "D6 pengelola menyetujui pendaftaran → status APPROVED",
        kode == 200 and putus.get("status") == "APPROVED",
        [kode, putus],
    )
    ok(
        "D7 status biometrik pengguna menjadi ACTIVE",
        biometrik_sekarang(tok) == "ACTIVE",
        biometrik_sekarang(tok),
    )

    kode, isi, _ = req(
        "POST",
        API + "/admin/enrollment/" + (enr.get("id") or "") + "/putuskan",
        {"approve": False, "note": "ganda"},
        token=admin_token,
    )
    ok("D8 keputusan kedua atas pengajuan yang sama ditolak", kode >= 400, [kode, isi])

    aksi = audit_aksi(admin_token)
    ok(
        "D9 jejak audit mencatat pengiriman & persetujuan biometrik",
        "MENGIRIM_PENDAFTARAN_WAJAH" in aksi and "MENYETUJUI_BIOMETRIK" in aksi,
        sorted(set(aksi))[:12],
    )
    return akun



# ---------------------------------------------------------------------------
# E. Presensi datang & pulang — GPS, verifikasi wajah AI, waktu server
# ---------------------------------------------------------------------------


def menit(jam: str) -> int:
    try:
        h, m = (jam or "00:00").split(":")[:2]
        return int(h) * 60 + int(m)
    except ValueError:
        return -1


def harap_masuk(jadwal: dict) -> str:
    sekarang = sekarang_wita()
    batas = menit(jadwal.get("checkInDeadline", ""))
    return "TERLAMBAT" if (sekarang.hour * 60 + sekarang.minute) > batas else "TEPAT_WAKTU"


def harap_pulang(jadwal: dict) -> str:
    sekarang = sekarang_wita()
    kini = sekarang.hour * 60 + sekarang.minute
    mulai, akhir = menit(jadwal.get("checkOutStart", "")), menit(jadwal.get("checkOutEnd", ""))
    if kini < mulai:
        return "PULANG_CEPAT"
    if kini > akhir:
        return "LEBIH_KERJA"
    return "TEPAT_WAKTU"


def hhmm_menit(m: int) -> str:
    """Menit sejak tengah malam → \"HH:MM\" (dijepit ke rentang satu hari)."""
    m = max(0, min(23 * 60 + 59, m))
    return f"{m // 60:02d}:{m % 60:02d}"


def menit_kini() -> int:
    sekarang = sekarang_wita()
    return sekarang.hour * 60 + sekarang.minute


def admin_user_id_atau(admin_token: str) -> str:
    kode, isi, _ = req("GET", API + "/auth/saya", token=admin_token)
    return (isi or {}).get("id", "usr-tidak-ada") if kode == 200 else "usr-tidak-ada"


def bagian_e(admin_token: str, akun: dict, cfg: dict, ai_nyata: bool) -> None:
    print("\n=== E. PRESENSI DATANG & PULANG (GPS + VERIFIKASI WAJAH) ===")
    tok = akun["token"] or ""
    lat, lng = cfg["lat"], cfg["lng"]
    jadwal = cfg["jadwal"]
    ok(
        "E1 konfigurasi aktif memuat kantor (titik & radius) dan jam kerja",
        bool(cfg["ok"] and lat and lng and cfg["radius"] and jadwal.get("checkInDeadline")),
        cfg,
    )
    if not (lat and lng and cfg["radius"]):
        return

    kode, isi = kirim_presensi(tok, "CHECK_OUT", lat, lng, GAMBAR_A)
    ok(
        "E2 presensi pulang tanpa presensi datang ditolak",
        (isi.get("rejection") or {}).get("code") == "BELUM_PRESENSI_MASUK",
        [kode, isi],
    )

    lat_jauh, lng_jauh = geser(lat, lng, float(cfg["radius"]) + 500)
    kode, isi = kirim_presensi(tok, "CHECK_IN", lat_jauh, lng_jauh, GAMBAR_A)
    ok(
        "E3 presensi di luar radius kantor ditolak",
        (isi.get("rejection") or {}).get("code") == "OUTSIDE_GEOFENCE",
        [kode, isi],
    )

    kode, isi = kirim_presensi(
        tok, "CHECK_IN", lat, lng, GAMBAR_A, akurasi=float(cfg["akurasi_maks"] or 50) + 200
    )
    ok(
        "E4 akurasi GPS melewati batas ditolak",
        (isi.get("rejection") or {}).get("code") == "GPS_INACCURATE",
        [kode, isi],
    )

    if ai_nyata and not WAJAH_SIAP:
        lewati(
            "E5–E6 verifikasi wajah",
            "model wajah aktif tetapi tidak ada foto wajah uji (UJI_WAJAH_DIR)",
        )
    else:
        kode, isi = kirim_presensi(tok, "CHECK_IN", lat, lng, GAMBAR_B, skor_wajah=0.99)
        ok(
            "E5 wajah tidak cocok ditolak (keputusan AI, bukan klaim klien 0.99)",
            (isi.get("rejection") or {}).get("code") == "FACE_FAILED",
            [kode, isi],
        )

        kode, isi = kirim_presensi(tok, "CHECK_IN", lat, lng, GAMBAR_A, hidup=0.05)
        ok(
            "E6 deteksi keaslian gagal → presensi ditolak",
            (isi.get("rejection") or {}).get("code") == "LIVENESS_FAILED",
            [kode, isi],
        )

    kode, isi = kirim_presensi(tok, "CHECK_IN", lat, lng, GAMBAR_A, skor_wajah=0.01)
    diterima = kode == 200 and isi.get("accepted") is True
    verif = isi.get("verification") or {}
    if ai_nyata and not WAJAH_SIAP:
        lewati(
            "E7 presensi datang diterima",
            "model wajah aktif tanpa foto uji: frame tidak dikenali sebagai wajah",
        )
        return
    ok(
        "E7 presensi datang diterima; skor resmi dari layanan AI walau klien mengaku 0.01",
        diterima and verif.get("faceScore", 0) >= 0.62 and verif.get("faceMatch") is True,
        [kode, verif],
    )
    if not diterima:
        return

    att = isi.get("attendance") or {}
    ok(
        "E8 status presensi datang dihitung server dari jam kerja basis data",
        att.get("status") == harap_masuk(jadwal),
        [att.get("status"), harap_masuk(jadwal), jadwal],
    )
    ok(
        "E9 verifikasi tersimpan: geofence INSIDE, akurasi & waktu server",
        (verif.get("geofence") or {}).get("verdict") == "INSIDE"
        and bool(verif.get("serverTime"))
        and (verif.get("geofence") or {}).get("accuracyMeters") is not None,
        verif,
    )

    kode, isi = kirim_presensi(tok, "CHECK_IN", lat, lng, GAMBAR_A)
    ok(
        "E10 presensi datang dua kali dalam sehari ditolak",
        (isi.get("rejection") or {}).get("code") == "SUDAH_PRESENSI",
        [kode, isi],
    )

    kode, hari, _ = req("GET", API + "/presensi/hari-ini", token=tok)
    ok(
        "E11 status hari ini: sudah datang, belum pulang",
        kode == 200 and (hari or {}).get("kind") == "SUDAH_CHECKIN"
        and ((hari or {}).get("attendance") or {}).get("type") == "CHECK_IN"
        and not (hari or {}).get("checkOut"),
        [kode, hari],
    )

    kode, isi = kirim_presensi(tok, "CHECK_OUT", lat, lng, GAMBAR_A)
    att_out = (isi or {}).get("attendance") or {}
    ok(
        "E12 presensi pulang diterima setelah datang",
        kode == 200 and (isi or {}).get("accepted") is True and att_out.get("type") == "CHECK_OUT",
        [kode, isi],
    )
    ok(
        "E13 status pulang dihitung server dari jam kerja basis data",
        att_out.get("status") == harap_pulang(jadwal),
        [att_out.get("status"), harap_pulang(jadwal), jadwal],
    )

    kode, hari, _ = req("GET", API + "/presensi/hari-ini", token=tok)
    ok(
        "E14 status hari ini: selesai dengan datang & pulang tercatat",
        kode == 200 and (hari or {}).get("kind") == "SELESAI"
        and bool((hari or {}).get("checkIn")) and bool((hari or {}).get("checkOut")),
        [kode, hari],
    )

    kode, riwayat, _ = req("GET", API + "/presensi/saya", token=tok)
    jenis = sorted({a.get("type") for a in (riwayat if isinstance(riwayat, list) else [])})
    ok(
        "E15 riwayat pengguna memuat kedua transaksi hari ini",
        kode == 200 and "CHECK_IN" in jenis and "CHECK_OUT" in jenis,
        jenis,
    )

    kode, lain, _ = req(
        "GET", API + "/presensi/saya?userId=" + admin_user_id_atau(admin_token), token=tok
    )
    baris_lain = lain if isinstance(lain, list) else []
    ok(
        "E16 pengguna tidak dapat membaca riwayat pengguna lain lewat ?userId",
        kode == 200 and all(a.get("userId") == akun["userId"] for a in baris_lain),
        [kode, len(baris_lain)],
    )


# ---------------------------------------------------------------------------
# F. Perubahan jam kerja & lokasi kantor dari aplikasi
# ---------------------------------------------------------------------------


def bagian_f(admin_token: str, cfg: dict, ai_nyata: bool) -> None:
    print("\n=== F. PERUBAHAN JAM KERJA & LOKASI KANTOR DARI APLIKASI ===")

    def set_jadwal(masuk: str, batas: str, pulang: str, batas_pulang: str) -> tuple[int, dict]:
        kode, isi, _ = req(
            "POST",
            API + "/admin/jadwal",
            {
                "checkInStart": masuk,
                "checkInDeadline": batas,
                "checkOutStart": pulang,
                "checkOutEnd": batas_pulang,
                "workDays": [0, 1, 2, 3, 4, 5, 6],
            },
            token=admin_token,
        )
        return kode, isi if isinstance(isi, dict) else {}

    def jadwal_db() -> dict:
        _, isi, _ = req("GET", API + "/konfigurasi", token=admin_token)
        return (isi or {}).get("schedule") or {}

    jadwal_lama = cfg["jadwal"]
    kini = menit_kini()
    lama_masuk = harap_masuk(jadwal_lama)

    # Jadwal A membuktikan BATAS MASUK baru yang dipakai. Arahnya dipilih agar
    # hasilnya pasti BERBEDA dari jadwal lama — apa pun jam penjalanan uji:
    # bila jadwal lama masih memberi TEPAT_WAKTU, jadwal baru dibuat lebih ketat
    # (lewat batas), dan sebaliknya. Aturan backend: jam masuk ≤ batas masuk ≤
    # jam pulang < batas pulang.
    if lama_masuk == "TERLAMBAT":
        batas_a = min(23 * 60 + 58, kini + 30)   # masih ≥ kini → TEPAT_WAKTU
    else:
        batas_a = max(0, kini - 30)              # < kini → TERLAMBAT
    masuk_a = max(0, batas_a - 60)
    pulang_a = max(batas_a, min(23 * 60 + 58, batas_a + 15))
    batas_pulang_a = max(pulang_a + 1, min(23 * 60 + 59, pulang_a + 60))
    jadwal_a = {
        "checkInStart": hhmm_menit(masuk_a),
        "checkInDeadline": hhmm_menit(batas_a),
        "checkOutStart": hhmm_menit(pulang_a),
        "checkOutEnd": hhmm_menit(batas_pulang_a),
        "workDays": [0, 1, 2, 3, 4, 5, 6],
    }
    harap_a = harap_masuk(jadwal_a)
    # Margin ≥ 5 menit bila harapannya TEPAT_WAKTU, supaya menit yang berganti di
    # tengah permintaan tidak membuat uji ini goyah.
    bisa_a = harap_a != lama_masuk and (harap_a != "TEPAT_WAKTU" or batas_a >= kini + 5)

    kode, jadwal_baru, _ = req(
        "POST",
        API + "/admin/jadwal",
        {
            "checkInStart": jadwal_a["checkInStart"],
            "checkInDeadline": jadwal_a["checkInDeadline"],
            "checkOutStart": jadwal_a["checkOutStart"],
            "checkOutEnd": jadwal_a["checkOutEnd"],
            "workDays": jadwal_a["workDays"],
        },
        token=admin_token,
    )
    ok(
        "F1 sekretaris mengubah jam kerja dari aplikasi",
        kode == 200 and (jadwal_baru or {}).get("checkInDeadline") == jadwal_a["checkInDeadline"],
        [kode, jadwal_baru, jadwal_a],
    )

    kode, cfg_baru, _ = req("GET", API + "/konfigurasi", token=admin_token)
    jadwal_db_a = (cfg_baru or {}).get("schedule") or {}
    ok(
        "F2 jam kerja baru langsung berlaku (dibaca ulang dari basis data)",
        kode == 200 and jadwal_db_a.get("checkInDeadline") == jadwal_a["checkInDeadline"],
        [kode, jadwal_db_a],
    )

    akun = siapkan_terverifikasi(admin_token, "f", benih=71)
    if not akun.get("token"):
        ok("F3 perangkat uji siap menilai jadwal baru", False, akun)
    elif ai_nyata and not WAJAH_SIAP:
        lewati("F3–F4 penilaian status dengan jam kerja baru", "tanpa foto wajah uji")
    elif not bisa_a:
        lewati(
            "F3 penilaian batas masuk baru",
            f"pada {hhmm(sekarang_wita())} WITA jadwal baru tidak dapat dibuat berbeda dari lama",
        )
    else:
        kode, isi = kirim_presensi(akun["token"], "CHECK_IN", cfg["lat"], cfg["lng"], GAMBAR_A)
        status = ((isi or {}).get("attendance") or {}).get("status")
        ok(
            f"F3 presensi datang dinilai batas masuk baru ({jadwal_a['checkInDeadline']}, bukan "
            f"{jadwal_lama.get('checkInDeadline')}): {harap_a}",
            (isi or {}).get("accepted") is True and status == harap_a,
            [kode, status, harap_a, lama_masuk, isi],
        )

    # Jadwal B membuktikan JAM PULANG baru yang dipakai. Sekali lagi arahnya
    # dipilih agar hasilnya pasti BERBEDA dari jadwal lama: bila jadwal lama
    # TEPAT_WAKTU, jendela pulang baru dibuat di luar waktu sekarang; bila tidak,
    # jendela pulang baru justru memuat waktu sekarang.
    lama_pulang = harap_pulang(jadwal_lama)
    if lama_pulang == "TEPAT_WAKTU" and kini <= 23 * 60 + 37:
        pulang_b = min(23 * 60 + 58, kini + 120)          # masih setelah kini → PULANG_CEPAT
        batas_pulang_b = min(23 * 60 + 59, pulang_b + 30)
    elif lama_pulang == "TEPAT_WAKTU":
        pulang_b = max(0, kini - 120)                     # sudah lewat → LEBIH_KERJA
        batas_pulang_b = max(pulang_b + 1, kini - 60)
    else:
        pulang_b = max(0, kini - 30)                      # jendela memuat kini → TEPAT_WAKTU
        batas_pulang_b = min(23 * 60 + 59, kini + 60)
    batas_b = max(0, pulang_b - 60)
    masuk_b = max(0, batas_b - 60)
    jadwal_b = {
        "checkInStart": hhmm_menit(masuk_b),
        "checkInDeadline": hhmm_menit(batas_b),
        "checkOutStart": hhmm_menit(pulang_b),
        "checkOutEnd": hhmm_menit(batas_pulang_b),
        "workDays": [0, 1, 2, 3, 4, 5, 6],
    }
    harap_b = harap_pulang(jadwal_b)
    bisa_b = harap_b != lama_pulang

    kode, jadwal_b_baru = set_jadwal(
        jadwal_b["checkInStart"], jadwal_b["checkInDeadline"],
        jadwal_b["checkOutStart"], jadwal_b["checkOutEnd"],
    )
    ok(
        "F4 sekretaris mengubah jam kerja sekali lagi (jendela pulang berbeda)",
        kode == 200 and (jadwal_b_baru or {}).get("checkOutStart") == jadwal_b["checkOutStart"],
        [kode, jadwal_b_baru, jadwal_b],
    )
    jadwal_db_b = jadwal_db()
    ok(
        "F5 jam pulang baru langsung berlaku (dibaca ulang dari basis data)",
        jadwal_db_b.get("checkOutStart") == jadwal_b["checkOutStart"]
        and jadwal_db_b.get("checkOutEnd") == jadwal_b["checkOutEnd"],
        [jadwal_db_b, jadwal_b],
    )

    akun2 = siapkan_terverifikasi(admin_token, "g", benih=131)
    if (ai_nyata and not WAJAH_SIAP) or not akun2.get("token"):
        lewati("F6 penilaian jam pulang baru", "tanpa foto wajah uji / akun tidak siap")
    elif not bisa_b:
        lewati(
            "F6 penilaian jam pulang baru",
            f"pada {hhmm(sekarang_wita())} WITA jadwal pulang tidak dapat dibuat berbeda dari lama",
        )
    else:
        # Presensi pulang menuntut presensi datang lebih dahulu hari ini.
        kirim_presensi(akun2["token"], "CHECK_IN", cfg["lat"], cfg["lng"], GAMBAR_A)
        kode, isi = kirim_presensi(akun2["token"], "CHECK_OUT", cfg["lat"], cfg["lng"], GAMBAR_A)
        status = ((isi or {}).get("attendance") or {}).get("status")
        ok(
            f"F6 presensi pulang dinilai jam pulang baru ({jadwal_b['checkOutStart']}–"
            f"{jadwal_b['checkOutEnd']}, bukan {jadwal_lama.get('checkOutStart')}): {harap_b}",
            (isi or {}).get("accepted") is True and status == harap_b,
            [kode, status, harap_b, lama_pulang, isi],
        )

    kode, _jadwal_pulih = set_jadwal(
        jadwal_lama.get("checkInStart", "07:30"),
        jadwal_lama.get("checkInDeadline", "08:00"),
        jadwal_lama.get("checkOutStart", "16:00"),
        jadwal_lama.get("checkOutEnd", "17:00"),
    )
    jadwal_pulih = jadwal_db()
    ok(
        "F7 jam kerja dikembalikan ke nilai semula",
        kode == 200 and jadwal_pulih.get("checkInDeadline") == jadwal_lama.get("checkInDeadline")
        and jadwal_pulih.get("checkOutStart") == jadwal_lama.get("checkOutStart"),
        [kode, jadwal_pulih, jadwal_lama],
    )

    # Pergeseran harus melebihi radius yang berlaku, apa pun nilainya: kalau
    # tidak, koordinat kantor lama masih di dalam area dan F9 tidak bermakna.
    lat_palsu, lng_palsu = geser(
        cfg["lat"], cfg["lng"], float(cfg["radius"] or 100) + 500
    )
    bentuk_kantor = {
        "name": cfg["nama"] or "Kantor Desa Anabanua",
        "latitude": lat_palsu,
        "longitude": lng_palsu,
        "radiusMeters": int(cfg["radius"] or 100),
    }
    kode, kantor, _ = req("POST", API + "/admin/kantor", bentuk_kantor, token=admin_token)
    titik = (kantor or {}).get("point") or {}
    ok(
        "F8 titik kantor dipindahkan dari aplikasi & tersimpan di basis data",
        kode == 200 and abs(titik.get("latitude", 0) - lat_palsu) < 1e-6,
        [kode, kantor],
    )

    akun3 = siapkan_terverifikasi(admin_token, "h", benih=191)
    if (ai_nyata and not WAJAH_SIAP) or not akun3.get("token"):
        lewati("F9 geofence memakai titik kantor baru", "tanpa foto wajah uji / akun tidak siap")
    else:
        kode, isi = kirim_presensi(akun3["token"], "CHECK_IN", cfg["lat"], cfg["lng"], GAMBAR_A)
        ok(
            "F9 titik kantor baru ditegakkan: koordinat kantor lama kini di luar radius",
            (isi.get("rejection") or {}).get("code") == "OUTSIDE_GEOFENCE",
            [kode, isi],
        )

    kode, _, _ = req(
        "POST",
        API + "/admin/kantor",
        {
            "name": cfg["nama"] or "Kantor Desa Anabanua",
            "latitude": cfg["lat"],
            "longitude": cfg["lng"],
            "radiusMeters": int(cfg["radius"] or 100),
        },
        token=admin_token,
    )
    _, cfg_pulih, _ = req("GET", API + "/konfigurasi", token=admin_token)
    kantor_pulih = ((cfg_pulih or {}).get("office") or {}).get("point") or {}
    ok(
        "F10 titik kantor dikembalikan ke nilai semula",
        kode == 200 and abs(kantor_pulih.get("latitude", 0) - cfg["lat"]) < 1e-6,
        [kode, kantor_pulih, cfg["lat"]],
    )

    aksi = audit_aksi(admin_token)
    ok(
        "F11 jejak audit mencatat perubahan jam kerja & kantor",
        "MENGUBAH_JADWAL" in aksi and "MENGUBAH_KANTOR" in aksi,
        sorted(set(aksi))[:14],
    )


def bagian_g(akun: dict) -> None:
    """Profil pemilik akun: apa yang boleh dan tidak boleh diubah sendiri.

    Menjawab langsung pertanyaan "kenapa data identitas tidak dapat diperbarui
    sendiri": kontak dan kata sandi memang punya jalurnya (POST /profil,
    POST /profil/sandi), sedangkan nama/email/NIP/jabatan/unit tidak punya jalur
    tulis sama sekali — bukan sekadar tidak ada kolomnya di antarmuka.
    """
    print("\n=== G. PROFIL PEMILIK AKUN (KONTAK & KATA SANDI) ===")
    token = akun.get("token") or ""
    if not token:
        lewati("G1–G10 profil pemilik akun", "tidak ada sesi perangkat desa")
        return

    kontak = {"phoneNumber": "0852-4000-9001", "address": "Dusun Anabanua, Kec. Barru"}

    kode, isi, _ = req("POST", API + "/profil", kontak, token=token)
    ok("G1 telepon & alamat sendiri dapat diperbarui (200)", kode == 200, [kode, isi])

    kode, saya, _ = req("GET", API + "/auth/saya", token=token)
    resmi = (saya or {}).get("official") or {}
    ok(
        "G2 nilai tersimpan dan dibaca ulang dari server",
        kode == 200
        and resmi.get("phoneNumber") == kontak["phoneNumber"]
        and resmi.get("address") == kontak["address"],
        [kode, resmi],
    )

    # Identitas kepegawaian: endpoint ini tidak mengenal fieldnya, jadi tidak ada
    # cara menyelundupkan nama/NIP lewat badan permintaan.
    kode, isi, _ = req(
        "POST", API + "/profil", {**kontak, "fullName": "Nama Karangan Sendiri"}, token=token
    )
    kode2, saya2, _ = req("GET", API + "/auth/saya", token=token)
    nama_resmi = (akun.get("pengguna") or {}).get("fullName")
    ok(
        "G3 nama/NIP tidak dapat diselundupkan lewat /profil (400, nilai tetap)",
        kode == 400 and (saya2 or {}).get("fullName") == nama_resmi,
        [kode, isi, (saya2 or {}).get("fullName")],
    )

    kode, isi, _ = req(
        "POST", API + "/profil", {"phoneNumber": "12", "address": kontak["address"]}, token=token
    )
    ok("G4 nomor telepon tidak sah ditolak (400)", kode == 400, [kode, isi])

    kode, isi, _ = req(
        "POST",
        API + "/profil/sandi",
        {"sandiLama": "SalahSekali123", "sandiBaru": "SandiBaru123456"},
        token=token,
    )
    ok("G5 ganti kata sandi dengan sandi lama salah ditolak (400)", kode == 400, [kode, isi])

    kode, isi, _ = req(
        "POST",
        API + "/profil/sandi",
        {"sandiLama": akun["sandi"], "sandiBaru": akun["sandi"]},
        token=token,
    )
    ok("G6 kata sandi baru wajib berbeda dari yang lama (400)", kode == 400, [kode, isi])

    sandi_baru = akun["sandi"] + "Baru"
    kode, isi, _ = req(
        "POST",
        API + "/profil/sandi",
        {"sandiLama": akun["sandi"], "sandiBaru": sandi_baru},
        token=token,
    )
    ok("G7 ganti kata sandi sendiri berhasil (204)", kode == 204, [kode, isi])

    kode_lama, _, _ = masuk(akun["email"], akun["sandi"])
    kode_baru, _, tok_baru = masuk(akun["email"], sandi_baru)
    ok(
        "G8 sandi lama mati dan sandi baru berlaku",
        kode_lama == 401 and kode_baru == 200 and bool(tok_baru),
        [kode_lama, kode_baru],
    )
    if tok_baru:
        akun["token"] = tok_baru
        akun["sandi"] = sandi_baru

    # Kontrak galat: /api/ salah ketik atau salah metode tetap berbentuk JSON,
    # bukan "404 page not found" teks polos dari ServeMux.
    kode, isi, _ = req("GET", API + "/rute-yang-tidak-ada", token=akun["token"])
    ok(
        "G9 /api/ tak dikenal dibalas JSON 404",
        kode == 404 and isinstance(isi, dict) and bool(isi.get("pesan")),
        [kode, isi],
    )

    kode, isi, kepala = req(
        "PUT", API + "/profil", {"phoneNumber": kontak["phoneNumber"]}, token=akun["token"]
    )
    ok(
        "G10 metode salah dibalas JSON 405 + header Allow",
        kode == 405
        and isinstance(isi, dict)
        and bool(isi.get("pesan"))
        and "POST" in (kepala.get("Allow") or ""),
        [kode, isi, kepala.get("Allow")],
    )

    kode, isi, _ = req("POST", API + "/profil", kontak)
    ok("G11 tanpa sesi, profil sendiri pun ditolak (401)", kode == 401, [kode, isi])


# ---------------------------------------------------------------------------
# H. Hari tanpa presensi: tidak hadir dan tidak ada keterangan = terlihat
# ---------------------------------------------------------------------------


def baris_rekap(baris: object, user_id: str) -> dict:
    if isinstance(baris, list):
        for b in baris:
            if isinstance(b, dict) and b.get("userId") == user_id:
                return b
    return {}


def hari_kerja_wita(schedule: dict, tgl) -> bool:
    # Python: Monday=0..Sunday=6 → 0=Minggu..6=Sabtu seperti jadwal backend.
    hari = (tgl.weekday() + 1) % 7
    return hari in (schedule.get("workDays") or [])


def bagian_h(admin_token: str, akun: dict) -> None:
    """Rekap bulanan ikut menghitung hari yang dilewati tanpa presensi.

    Sebelumnya rekap hanya mengenal hadir dan terlambat: perangkat yang tidak
    melakukan presensi sama sekali tidak muncul di mana pun. Kini kolom
    `tanpaKeterangan` menghitung hari kerja yang batas masuknya sudah lewat,
    tanpa presensi masuk, dan tanpa izin/sakit/cuti disetujui.

    Kolom `terlambatMenit`/`pulangCepatMenit` melengkapinya dengan **durasi**:
    "3 kali terlambat" tidak menjawab "lambat berapa menit/jam".
    """
    print("\n=== H. HARI TANPA PRESENSI (REKAP BULANAN) ===")
    user_id = (akun.get("pengguna") or {}).get("id") or ""
    if not user_id:
        lewati("H1–H9 rekap tanpa keterangan", "tidak ada akun uji teraktivasi")
        return

    kode, cfg, _ = req("GET", API + "/konfigurasi", token=admin_token)
    schedule = (cfg or {}).get("schedule") or {}
    ok("H1 konfigurasi jadwal terbaca pengelola", kode == 200 and bool(schedule), [kode, schedule])
    batas_masuk = str(schedule.get("checkInDeadline") or "08:00")
    kini_wita = sekarang_wita()
    hari_ini = kini_wita.date().isoformat()
    tahun, bulan = kini_wita.year, kini_wita.month

    kode, baris, _ = req(
        "GET", API + f"/admin/rekap?tahun={tahun}&bulan={bulan}", token=admin_token
    )
    daftar = baris if isinstance(baris, list) else []
    ok(
        "H2 rekap bulan berjalan terbaca",
        kode == 200 and isinstance(baris, list),
        [kode, len(daftar)],
    )
    milik = baris_rekap(daftar, user_id)
    ok(
        "H3 akun uji muncul di rekap sebagai perangkat aktif",
        bool(milik),
        [user_id, (milik or {}).get("userName")],
    )

    angka_ok = True
    for kolom in (
        "hadir",
        "terlambat",
        "izin",
        "sakit",
        "cuti",
        "tanpaKeterangan",
        "terlambatMenit",
        "pulangCepatMenit",
    ):
        nilai = (milik or {}).get(kolom)
        if not (isinstance(nilai, int) and nilai >= 0):
            angka_ok = False
    ok("H4 seluruh kolom rekap berupa angka ≥ 0", angka_ok, milik)

    # Harapan "tanpa keterangan" dihitung ulang dari bahan yang sama seperti
    # server: hari kerja bulan ini sampai hari ini (hari ini hanya bila batas
    # masuk sudah lewat).
    def menit(jam_menit: str) -> int:
        h, m = jam_menit.split(":")
        return int(h) * 60 + int(m)

    tutup = menit_kini() >= menit(batas_masuk)
    hari_kerja_tutup: list[str] = []
    tgl = date(tahun, bulan, 1)
    while tgl.month == bulan:
        iso = tgl.isoformat()
        if hari_kerja_wita(schedule, tgl) and (iso < hari_ini or (iso == hari_ini and tutup)):
            hari_kerja_tutup.append(iso)
        tgl += timedelta(days=1)

    kode_p, presensi, _ = req(
        "GET", API + f"/admin/presensi?tanggal={hari_ini}", token=admin_token
    )
    hadir_hari = {
        (a or {}).get("userId")
        for a in (presensi if isinstance(presensi, list) else [])
        if isinstance(a, dict) and a.get("type") == "CHECK_IN"
    }
    ok(
        "H5 presensi hari ini terbaca untuk pemeriksaan silang",
        kode_p == 200 and isinstance(presensi, list),
        [kode_p, len(hadir_hari)],
    )
    ok(
        "H6 hari ini hanya tertutup bila batas masuk sudah lewat "
        f"({hari_ini} vs {batas_masuk}, kini {hhmm(sekarang_wita())} WITA)",
        (hari_ini in hari_kerja_tutup) == (hari_kerja_wita(schedule, kini_wita.date()) and tutup),
        [hari_ini in hari_kerja_tutup, tutup],
    )

    # Akun uji (dibuat bulan ini, tanpa pengajuan disetujui) hanya boleh punya
    # tanpa keterangan dari hari kerja yang sudah tutup buku sejak akun dibuat.
    tk_bulan = (milik or {}).get("tanpaKeterangan")
    ok(
        f"H7 tanpa keterangan {tk_bulan} dalam 0..{len(hari_kerja_tutup)} "
        "(hari kerja tertutup bulan ini)",
        isinstance(tk_bulan, int) and 0 <= tk_bulan <= len(hari_kerja_tutup),
        [tk_bulan, len(hari_kerja_tutup)],
    )

    # Bulan lalu: akun uji belum ada, jadi tanpa keterangannya harus nol —
    # hari sebelum akun dibuat tidak boleh dihitung.
    bln_lalu = date(tahun, bulan, 1) - timedelta(days=1)
    kode, baris_lalu, _ = req(
        "GET", API + f"/admin/rekap?tahun={bln_lalu.year}&bulan={bln_lalu.month}",
        token=admin_token,
    )
    milik_lalu = baris_rekap(baris_lalu if isinstance(baris_lalu, list) else [], user_id)
    ok(
        "H8 bulan sebelum akun dibuat: tanpa keterangan nol",
        kode == 200 and milik_lalu.get("tanpaKeterangan") == 0,
        [kode, (milik_lalu or {}).get("tanpaKeterangan")],
    )

    # Non-admin tetap tidak boleh membaca rekap.
    kode, isi, _ = req(
        "GET", API + f"/admin/rekap?tahun={tahun}&bulan={bulan}", token=akun.get("token") or ""
    )
    ok("H9 perangkat desa tidak boleh membaca rekap (403)", kode == 403, [kode, isi])

    # Durasi, bukan hanya jumlah kejadian: tanpa satu pun transaksi terlambat,
    # kolom menitnya harus nol — angka "total terlambat 2 jam" tanpa kejadian
    # akan menyesatkan penilaian kedisiplinan.
    jumlah_terlambat = int((milik or {}).get("terlambat") or 0)
    menit_terlambat = int((milik or {}).get("terlambatMenit") or 0)
    ok(
        "H10 durasi terlambat nol bila tidak ada kejadian terlambat",
        jumlah_terlambat > 0 or menit_terlambat == 0,
        [jumlah_terlambat, menit_terlambat],
    )

    # Konsistensi status vs durasi: tiap kejadian TERLAMBAT/PULANG_CEPAT yang
    # dinilai terhadap jadwal SAAT transaksi dicatat menyimpan selisihnya
    # (`selisihMenit`), sehingga total durasi tidak boleh nol bila ada
    # kejadiannya — kecuali jadwal diubah setelah transaksi dicatat (durasi
    # lama dihitung ulang dari jadwal aktif sebagai fallback).
    jumlah_pc = sum(
        1
        for a in (presensi if isinstance(presensi, list) else [])
        if isinstance(a, dict)
        and a.get("userId") == user_id
        and a.get("type") == "CHECK_OUT"
        and a.get("status") == "PULANG_CEPAT"
    )
    menit_pc = int((milik or {}).get("pulangCepatMenit") or 0)
    ok(
        "H11 durasi pulang cepat nol bila tidak ada kejadian pulang cepat",
        jumlah_pc > 0 or menit_pc == 0,
        [jumlah_pc, menit_pc],
    )

    # Arah sebaliknya — inti keluhan "terlambat 1 kali = 0 menit": selama ada
    # kejadiannya, durasinya wajib terisi. Selisih menit disimpan pada tiap
    # transaksi saat presensi dicatat, jadi jadwal yang diubah di tengah bulan
    # tidak lagi membuat totalnya jatuh ke nol.
    ok(
        "H12 ada kejadian terlambat -> durasi terlambat > 0",
        jumlah_terlambat == 0 or menit_terlambat > 0,
        [jumlah_terlambat, menit_terlambat],
    )
    ok(
        "H13 ada kejadian pulang cepat -> durasi pulang cepat > 0",
        jumlah_pc == 0 or menit_pc > 0,
        [jumlah_pc, menit_pc],
    )

    # Tiap baris presensi membawa selisih menitnya sendiri (dinilai terhadap
    # jadwal saat transaksi dicatat): baris TERLAMBAT tidak boleh berselisih
    # nol, dan baris TEPAT_WAKTU tidak boleh berselisih bukan nol. Tanpa nilai
    # ini rekap hanya bisa menebak dari jadwal yang berlaku kini.
    baris_selisih_salah = [
        a
        for a in (presensi if isinstance(presensi, list) else [])
        if isinstance(a, dict)
        and (
            (a.get("status") == "TERLAMBAT" and not a.get("selisihMenit"))
            or (a.get("status") == "TEPAT_WAKTU" and a.get("selisihMenit"))
        )
    ]
    ok(
        "H14 baris presensi memuat selisihMenit yang sependapat dengan statusnya",
        not baris_selisih_salah,
        baris_selisih_salah[:3],
    )


# ---------------------------------------------------------------------------
# Pembersihan akun uji (opsional: E2E_BERSIHKAN=1)
# ---------------------------------------------------------------------------


def bersihkan() -> None:
    """Hapus akun uji (`*@uji.anabanua.id`) beserta jejaknya lewat MySQL di Docker."""
    import subprocess

    sql = (
        "DELETE FROM audit WHERE actor_id IN (SELECT id FROM pengguna WHERE email LIKE '%@uji.anabanua.id');"
        " DELETE FROM presensi WHERE pengguna_id IN (SELECT id FROM pengguna WHERE email LIKE '%@uji.anabanua.id');"
        " DELETE FROM pengajuan WHERE pengguna_id IN (SELECT id FROM pengguna WHERE email LIKE '%@uji.anabanua.id');"
        " DELETE FROM enrollment WHERE pengguna_id IN (SELECT id FROM pengguna WHERE email LIKE '%@uji.anabanua.id');"
        " DELETE FROM undangan WHERE pengguna_id IN (SELECT id FROM pengguna WHERE email LIKE '%@uji.anabanua.id');"
        " DELETE FROM sesi_dibatalkan WHERE pengguna_id IN (SELECT id FROM pengguna WHERE email LIKE '%@uji.anabanua.id');"
        " DELETE FROM pengguna WHERE email LIKE '%@uji.anabanua.id';"
        " SELECT COUNT(*) AS sisa_akun_uji FROM pengguna WHERE email LIKE '%@uji.anabanua.id';"
    )
    perintah = [
        "docker", "compose", "exec", "-T", "db",
        "sh", "-c", 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "' + sql + '"',
    ]
    print("\n--- Membersihkan akun uji ---")
    try:
        hasil = subprocess.run(perintah, cwd=AKAR, capture_output=True, text=True, timeout=120)
        pesan = (hasil.stdout or "") + (hasil.stderr or "")
        print(pesan.strip()[-400:] or "(tanpa keluaran)")
    except (OSError, subprocess.SubprocessError) as e:
        print(f"Pembersihan dilewati: {e}")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main() -> int:
    print("Uji E2E terpadu Sistem Presensi Desa Anabanua")
    print(f"  API: {API}")
    print(f"  AI : {AI}")
    provider, ai_nyata = bagian_a()
    tok_kades, tok_sekre = bagian_b()
    # bagian_b mencabut sesi sekretaris (B9) lalu menerbitkan sesi barunya;
    # pakai sesi sekretaris yang segar untuk C–F (bukan kades yang tak dipakai).
    tok_admin = tok_sekre or tok_kades
    if not tok_admin:
        print("\nTanpa sesi kepala desa, bagian C–H dilewati.")
    else:
        akun, _ = bagian_c(tok_admin)
        if not akun.get("token"):
            print("\nAktivasi akun uji gagal: bagian D–H dilewati.")
        else:
            akun = bagian_d(tok_admin, akun, ai_nyata)
            bagian_e(tok_admin, akun, titik_kantor(tok_admin), ai_nyata)
            # Rekap dibaca sebelum bagian F mengobrak-abrik jadwal & kantor,
            # supaya harapan "tanpa keterangan" dihitung terhadap jadwal asli.
            bagian_h(tok_admin, akun)
            bagian_f(tok_admin, titik_kantor(tok_admin), ai_nyata)
            # Terakhir: mengganti kata sandi akun uji, jadi bagian lain selesai dulu.
            bagian_g(akun)

    print("\n=== RINGKASAN ===")
    print(f"  provider wajah : {provider or '(tidak diketahui)'}")
    print(f"  lulus          : {LULUS}")
    print(f"  lewat          : {LEWAT}")
    print(f"  gagal          : {GAGAL}")
    if CATATAN_GAGAL:
        print("  daftar gagal   :")
        for nama in CATATAN_GAGAL:
            print(f"    - {nama}")
    if os.environ.get("E2E_BERSIHKAN") == "1":
        bersihkan()
    else:
        print("  (akun uji *@uji.anabanua.id dibiarkan; jalankan dengan "
              "E2E_BERSIHKAN=1 untuk menghapusnya)")
    return 1 if GAGAL else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nDihentikan pengguna.")
        sys.exit(130)
