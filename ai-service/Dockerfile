# ---------------------------------------------------------------------------
# Layanan AI — deteksi wajah, liveness, pencocokan embedding (Python/FastAPI)
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# libglib2.0-0 + libgl1: kebutuhan OpenCV/InsightFace saat runtime.
# tzdata: waktu WITA agar cap waktu pada balasan konsisten dengan backend.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        tzdata \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && adduser --disabled-password --gecos "" --uid 10001 appuser

ENV TZ=Asia/Makassar \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Model wajah (buffalo_l: deteksi SCRFD + pengenal ArcFace) diunduh SAAT MEMBANGUN
# image agar layanan siap dipakai tanpa internet pada saat berjalan. Unduhan
# ±280 MB dan disimpan pada INSIGHTFACE_HOME milik pengguna aplikasi.
ENV INSIGHTFACE_HOME=/home/appuser/.insightface
RUN install -d -o appuser -g appuser "$INSIGHTFACE_HOME"

COPY app ./app

USER appuser
RUN python -c "from insightface.app import FaceAnalysis as F; f = F(name='buffalo_l', providers=['CPUExecutionProvider']); f.prepare(ctx_id=0, det_size=(640, 640))"

EXPOSE 8100

# --workers 1: model deteksi wajah dimuat sekali per proses; menambah worker
# menggandakan pemakaian memori tanpa menambah throughput yang berarti.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
