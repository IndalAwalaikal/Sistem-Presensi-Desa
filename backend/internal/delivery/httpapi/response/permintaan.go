package response

import (
	"encoding/json"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// Dekode: baca & validasi isi JSON dengan batas ukuran; false = sudah dibalas.
func Dekode(w http.ResponseWriter, r *http.Request, batas int64, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, batas)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		Galat(w, http.StatusBadRequest, "Isi permintaan bukan JSON sah atau melewati batas ukuran.")
		return false
	}
	return true
}

// IPKlien: alamat asli pemohon.
//
// X-Forwarded-For dipercaya HANYA bila koneksi TCP memang datang dari proxy
// yang terdaftar di `TRUSTED_PROXIES`. Sebelumnya header itu dipercaya apa
// adanya, sehingga siapa pun dapat mengarang `X-Forwarded-For: 1.2.3.x` baru di
// setiap permintaan dan melewati pembatas laju login sepenuhnya — cukup untuk
// menebak kata sandi akun sekretaris/kepala desa tanpa henti.
//
// Bila koneksi datang dari proxy terpercaya, rantai dibaca dari KANAN ke kiri:
// entri pertama yang bukan proxy terpercaya adalah klien sebenarnya (proxy
// menambahkan alamat yang ia lihat di ujung rantai). Entri di sebelah kirinya
// bisa saja hasil karangan klien, jadi tidak pernah dipakai.
//
// Alamat koneksi langsung selalu dipakai bila tidak ada proxy terpercaya.
func IPKlien(r *http.Request, proxyTerpercaya []netip.Prefix) string {
	langsung := alamatHost(r.RemoteAddr)
	if !proxyTerpercayaDi(langsung, proxyTerpercaya) {
		return langsung
	}
	xf := r.Header.Get("X-Forwarded-For")
	if xf == "" {
		return langsung
	}
	bagian := strings.Split(xf, ",")
	for i := len(bagian) - 1; i >= 0; i-- {
		kandidat := strings.TrimSpace(bagian[i])
		if kandidat == "" {
			continue
		}
		if !proxyTerpercayaDi(kandidat, proxyTerpercaya) {
			return kandidat
		}
	}
	return langsung
}

// alamatHost: buang port dari RemoteAddr; kembalikan apa adanya bila tidak
// berformat host:port.
func alamatHost(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

func proxyTerpercayaDi(host string, daftar []netip.Prefix) bool {
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	ip = ip.Unmap()
	for _, p := range daftar {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}
