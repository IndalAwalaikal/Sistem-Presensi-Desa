package tests

import (
	"net/http/httptest"
	"net/netip"
	"testing"

	"presensi-anabanua/backend/internal/delivery/httpapi/response"
)

var (
	proxyLokal  = netip.MustParsePrefix("127.0.0.1/32")
	jaringDalam = netip.MustParsePrefix("10.0.0.0/8")
)

// X-Forwarded-For hanya boleh dipercaya dari proxy yang terdaftar: tanpa itu
// penyerang mengarang alamat baru di tiap permintaan dan pembatas laju login
// (brute force kata sandi pengelola akun) dilewati sepenuhnya.
func TestIPKlienMengabaikanHeaderTanpaProxyTerpercaya(t *testing.T) {
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = "203.0.113.9:4123"
	r.Header.Set("X-Forwarded-For", "1.2.3.4")

	// Tanpa daftar proxy (bawaan): alamat koneksi langsung yang dipakai.
	if got := response.IPKlien(r, nil); got != "203.0.113.9" {
		t.Fatalf("tanpa proxy terpercaya harus memakai RemoteAddr, dapat %q", got)
	}
	// Daftar proxy yang tidak memuat pengirim juga tidak mengubah apa pun.
	if got := response.IPKlien(r, []netip.Prefix{proxyLokal}); got != "203.0.113.9" {
		t.Fatalf("proxy tak dikenal harus diabaikan, dapat %q", got)
	}
}

// Bila permintaan memang lewat proxy terpercaya, alamat klien diambil dari ujung
// rantai — entri di sebelah kirinya bisa saja karangan klien, jadi tidak dipakai.
func TestIPKlienMemakaiEntriTerakhirYangBukanProxy(t *testing.T) {
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = "10.0.0.7:5500"
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 198.51.100.5")

	if got := response.IPKlien(r, []netip.Prefix{jaringDalam}); got != "198.51.100.5" {
		t.Fatalf("alamat klien sebenarnya 198.51.100.5, dapat %q", got)
	}

	// Rantai dua proxy terpercaya: keduanya dilewati, klien tetap ditemukan.
	r.Header.Set("X-Forwarded-For", "198.51.100.5, 10.1.2.3")
	if got := response.IPKlien(r, []netip.Prefix{jaringDalam}); got != "198.51.100.5" {
		t.Fatalf("proxy terpercaya harus dilewati, dapat %q", got)
	}

	// Seluruh rantai berisi proxy terpercaya (mis. health check internal):
	// jatuh kembali ke alamat koneksi langsung.
	r.Header.Set("X-Forwarded-For", "10.1.2.3")
	if got := response.IPKlien(r, []netip.Prefix{jaringDalam}); got != "10.0.0.7" {
		t.Fatalf("tanpa klien di rantai, pakai RemoteAddr, dapat %q", got)
	}

	// Tanpa header sama sekali tetap alamat koneksi langsung.
	r.Header.Del("X-Forwarded-For")
	if got := response.IPKlien(r, []netip.Prefix{jaringDalam}); got != "10.0.0.7" {
		t.Fatalf("tanpa header, pakai RemoteAddr, dapat %q", got)
	}
}
