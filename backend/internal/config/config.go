// Package config: seluruh konfigurasi dari environment. Kredensial tidak
// pernah ditulis di kode; nilai lemah/kosong menggagalkan mulai cepat.
package config

import (
	"fmt"
	"math"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv       string
	CookieSecure bool
	Port         string
	CORSOrigins  []string

	// TrustedProxies: alamat proxy yang boleh dipercaya menitipkan alamat asli
	// klien lewat X-Forwarded-For. Daftar kosong (bawaan) berarti header itu
	// diabaikan sama sekali — lihat response.IPKlien.
	TrustedProxies []netip.Prefix

	DBHost     string
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string

	JWTSecret  string
	JWTTL      time.Duration
	BcryptCost int

	LoginRateMax    int
	LoginRateIPMax  int
	LoginRateWindow time.Duration
	MaxBodyBytes    int64

	AIBaseURL      string
	AIAPIKey       string
	AITimeout      time.Duration
	AmbangWajah    float64
	AmbangLiveness float64

	// Sumber resmi kalender hari libur (dipakai tombol "Tarik kalender resmi").
	// Kosong = impor dimatikan; kalender bawaan & suntingan manual tetap jalan.
	LiburAPIURL string

	// Webhook kedisiplinan (mis. gateway WhatsApp/bot Telegram desa). Kosong =
	// fitur dimatikan: kabar tidak dikirim, seluruh perhitungan tetap jalan.
	DisiplinWebhookURL     string
	DisiplinWebhookToken   string
	DisiplinWebhookTimeout time.Duration

	// Nilai penyemaian awal kantor (sekali, idempoten).
	KantorNama    string
	KantorLat     float64
	KantorLng     float64
	KantorRadiusM int
	AkurasiMaksM  int

	// Akun administratif pertama — dibuat saat mulai bila belum ada dan
	// kata sandinya diisi. Kredensial HANYA dari env, tidak pernah di kode.
	SeedSekretarisEmail string
	SeedSekretarisNama  string
	SeedSekretarisNIP   string
	SeedSekretarisSandi string
	SeedKepalaEmail     string
	SeedKepalaNama      string
	SeedKepalaNIP       string
	SeedKepalaSandi     string
}

func DSN(c *Config) string {
	return fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&loc=UTC&multiStatements=true",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName,
	)
}

func Muat() (*Config, error) {
	// Compose menimpa HTTP_ADDR (mis. "0.0.0.0:8080"); PORT tetap didukung
	// untuk menjalankan tanpa Docker.
	port := env("PORT", "8080")
	if addr := strings.TrimSpace(os.Getenv("HTTP_ADDR")); addr != "" {
		if i := strings.LastIndex(addr, ":"); i >= 0 && i+1 < len(addr) {
			port = addr[i+1:]
		}
	}
	c := &Config{
		AppEnv:          env("APP_ENV", "development"),
		CookieSecure:    strings.EqualFold(env("APP_ENV", "development"), "production"),
		Port:            port,
		CORSOrigins:     daftar(env("CORS_ORIGINS", "")),
		DBHost:          env("DB_HOST", "127.0.0.1"),
		DBPort:          env("DB_PORT", "3306"),
		DBName:          env("DB_NAME", ""),
		DBUser:          env("DB_USER", ""),
		DBPassword:      os.Getenv("DB_PASSWORD"), // wajib; boleh kosong string bila DB tanpa sandi
		LoginRateMax:    envInt("LOGIN_RATE_MAX", 8),
		LoginRateIPMax:  envInt("LOGIN_RATE_IP_MAX", envInt("LOGIN_RATE_MAX", 8)*5),
		LoginRateWindow: time.Duration(envInt("LOGIN_RATE_WINDOW_DETIK", 300)) * time.Second,
		MaxBodyBytes:    int64(envInt("MAX_BODY_MB", 8)) << 20,

		AIBaseURL:      strings.TrimRight(env("AI_BASE_URL", ""), "/"),
		AIAPIKey:       os.Getenv("AI_API_KEY"),
		AITimeout:      time.Duration(envInt("AI_TIMEOUT_MS", 4000)) * time.Millisecond,
		AmbangWajah:    envFloat("AMBANG_WAJAH", 0.62),
		AmbangLiveness: envFloat("AMBANG_LIVENESS", 0.5),

		LiburAPIURL: env("LIBUR_API_URL", "https://api-hari-libur.vercel.app/api"),

		DisiplinWebhookURL:     env("DISIPLIN_WEBHOOK_URL", ""),
		DisiplinWebhookToken:   os.Getenv("DISIPLIN_WEBHOOK_TOKEN"),
		DisiplinWebhookTimeout: time.Duration(envInt("DISIPLIN_WEBHOOK_TIMEOUT_MS", 6000)) * time.Millisecond,

		KantorNama:    env("KANTOR_NAMA", "Kantor Desa Anabanua"),
		KantorLat:     envFloat("KANTOR_LAT", -4.4680072),
		KantorLng:     envFloat("KANTOR_LNG", 119.713862),
		KantorRadiusM: envInt("KANTOR_RADIUS_M", 100),
		AkurasiMaksM:  envInt("AKURASI_MAKS_M", 50),

		SeedSekretarisEmail: env("SEED_SEKRETARIS_EMAIL", "sekretaris@anabanua.id"),
		SeedSekretarisNama:  env("SEED_SEKRETARIS_NAMA", "Sekretaris Desa"),
		SeedSekretarisNIP:   env("SEED_SEKRETARIS_NIP", "-"),
		SeedSekretarisSandi: os.Getenv("SEED_SEKRETARIS_SANDI"),
		SeedKepalaEmail:     env("SEED_KEPALA_EMAIL", "kepala@anabanua.id"),
		SeedKepalaNama:      env("SEED_KEPALA_NAMA", "Kepala Desa"),
		SeedKepalaNIP:       env("SEED_KEPALA_NIP", "-"),
		SeedKepalaSandi:     os.Getenv("SEED_KEPALA_SANDI"),
	}

	// Proxy terpercaya: hanya alamat yang terdaftar di sini yang boleh
	// menitipkan alamat klien lewat X-Forwarded-For. Kosong = tidak ada proxy
	// yang dipercaya, sehingga header itu diabaikan (bawaan yang aman).
	proxy, err := parseProxyTerpercaya(os.Getenv("TRUSTED_PROXIES"))
	if err != nil {
		return nil, err
	}
	c.TrustedProxies = proxy

	// Rahasia JWT wajib dan harus layak.
	c.JWTSecret = os.Getenv("JWT_SECRET")
	if len(c.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET wajib diisi dan minimal 32 karakter acak (openssl rand -base64 48)")
	}
	jam := envInt("JWT_TTL_JAM", 12)
	if jam < 1 || jam > 720 {
		return nil, fmt.Errorf("JWT_TTL_JAM harus 1..720, dapat %d", jam)
	}
	c.JWTTL = time.Duration(jam) * time.Hour

	c.BcryptCost = envInt("BCRYPT_COST", 12)
	if c.BcryptCost < 10 || c.BcryptCost > 15 {
		return nil, fmt.Errorf("BCRYPT_COST harus 10..15, dapat %d", c.BcryptCost)
	}

	if c.DBName == "" || c.DBUser == "" {
		return nil, fmt.Errorf("DB_NAME dan DB_USER wajib diisi")
	}
	if c.LoginRateMax < 1 {
		return nil, fmt.Errorf("LOGIN_RATE_MAX harus >= 1")
	}
	if c.LoginRateIPMax < c.LoginRateMax {
		return nil, fmt.Errorf("LOGIN_RATE_IP_MAX harus >= LOGIN_RATE_MAX")
	}
	if !ambangSah(c.AmbangWajah) || !ambangSah(c.AmbangLiveness) {
		return nil, fmt.Errorf("AMBANG_WAJAH dan AMBANG_LIVENESS harus angka finite antara 0 dan 1")
	}
	if strings.EqualFold(c.AppEnv, "production") && !c.AIaktif() {
		return nil, fmt.Errorf("AI_BASE_URL dan AI_API_KEY wajib diset pada APP_ENV=production")
	}
	return c, nil
}

func ambangSah(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= 1 }

// AIaktif: layanan AI dipakai bila URL dan kuncinya diset.
func (c *Config) AIaktif() bool { return c.AIBaseURL != "" && c.AIAPIKey != "" }

func env(kunci, bawaan string) string {
	v := strings.TrimSpace(os.Getenv(kunci))
	if v == "" {
		return bawaan
	}
	return v
}

func envInt(kunci string, bawaan int) int {
	v := strings.TrimSpace(os.Getenv(kunci))
	if v == "" {
		return bawaan
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return bawaan
	}
	return n
}

func envFloat(kunci string, bawaan float64) float64 {
	v := strings.TrimSpace(os.Getenv(kunci))
	if v == "" {
		return bawaan
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return bawaan
	}
	return f
}

// parseProxyTerpercaya: baca daftar alamat proxy dari env — alamat tunggal
// (mis. 127.0.0.1) maupun blok CIDR (mis. 10.0.0.0/8), dipisah koma. Nilai yang
// tidak dapat dibaca menggagalkan mulai: salah tulis di sini berarti pembatas
// laju login dapat dilewati, jadi tidak boleh diabaikan diam-diam.
func parseProxyTerpercaya(v string) ([]netip.Prefix, error) {
	bagian := daftar(v)
	if len(bagian) == 0 {
		return nil, nil
	}
	hasil := make([]netip.Prefix, 0, len(bagian))
	for _, s := range bagian {
		if p, err := netip.ParsePrefix(s); err == nil {
			hasil = append(hasil, p.Masked())
			continue
		}
		ip, err := netip.ParseAddr(s)
		if err != nil {
			return nil, fmt.Errorf("TRUSTED_PROXIES: %q bukan alamat atau blok CIDR yang sah", s)
		}
		hasil = append(hasil, netip.PrefixFrom(ip.Unmap(), ip.Unmap().BitLen()))
	}
	return hasil, nil
}

func daftar(v string) []string {
	if v == "" {
		return nil
	}
	bagian := strings.Split(v, ",")
	hasil := make([]string, 0, len(bagian))
	for _, s := range bagian {
		s = strings.TrimSpace(s)
		if s != "" {
			hasil = append(hasil, s)
		}
	}
	return hasil
}
