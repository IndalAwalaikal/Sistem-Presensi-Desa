# Perintah pengembangan backend. Salin .env.example → .env dahulu.
SHELL := /bin/bash

.PHONY: jalankan uji vet format build bersih

# Jalankan API (butuh MySQL berjalan & .env terisi).
jalankan:
	@set -a; [ -f .env ] && . ./.env; set +a; go run ./cmd/api

uji:
	go test ./...

vet:
	go vet ./...

format:
	gofmt -l .

build:
	go build -o bin/api ./cmd/api

bersih:
	rm -rf bin
