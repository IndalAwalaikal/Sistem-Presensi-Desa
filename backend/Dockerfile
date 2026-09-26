# ---------------------------------------------------------------------------
# Backend Go — presensi Anabanua
# Build multi-tahap: kompilasi statis di tahap build, jalankan di image ramping
# tanpa toolchain Go (permukaan serang lebih kecil).
# ---------------------------------------------------------------------------
FROM golang:1.24-alpine AS build

WORKDIR /src

# Unduh dependensi lebih dulu supaya lapisan ini dipakai ulang selama go.mod
# tidak berubah.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO dimatikan → binari statis murni; -trimpath menghapus jalur build lokal.
RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath -ldflags="-s -w" \
      -o /out/api ./cmd/api

# ---------------------------------------------------------------------------
FROM alpine:3.20 AS runtime

# ca-certificates: panggilan HTTPS ke layanan AI/DB bila diperlukan.
# tzdata: seluruh transaksi memakai WITA (Asia/Makassar).
RUN apk add --no-cache ca-certificates tzdata wget && \
    adduser -D -H -u 10001 appuser

ENV TZ=Asia/Makassar
WORKDIR /app

COPY --from=build /out/api /app/api

USER appuser
EXPOSE 8080

# Tanpa shell: sinyal langsung diterima proses agar shutdown rapi.
ENTRYPOINT ["/app/api"]

# Migrasi skema disalin agar backend dapat menjalankan migrasi idempoten
# (mysqlrepo.Migrasi) saat mulai di dalam kontainer.
COPY --chown=appuser migrations ./migrations
