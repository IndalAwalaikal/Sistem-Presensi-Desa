# ---------------------------------------------------------------------------
# Frontend Next.js — presensi Anabanua
# Build produksi lalu jalankan `next start` sebagai pengguna tanpa hak root.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci bila lockfile tersedia (build reprodusibel), jika tidak npm install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Nilai NEXT_PUBLIC_* ditanam saat build (dibaca di browser), jadi mode API
# harus sudah benar di tahap ini — bukan lewat docker-compose `environment`.
ARG NEXT_PUBLIC_API_MODE=http
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
ENV NEXT_PUBLIC_API_MODE=${NEXT_PUBLIC_API_MODE} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1

RUN test "$NEXT_PUBLIC_API_MODE" = "http"

RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN addgroup -g 10001 -S nodejs && adduser -S nextjs -u 10001 -G nodejs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Makassar \
    PORT=3080 \
    HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

USER nextjs
EXPOSE 3080

# Server mandiri hasil `output: standalone`.
CMD ["node", "server.js"]
