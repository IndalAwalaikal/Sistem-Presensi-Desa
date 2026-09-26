// Package response: bentuk tanggapan HTTP yang dijanjikan frontend.
// Seluruh galat selalu berbentuk {"pesan": "..."} (camelCase untuk data).
package response

import (
	"encoding/json"
	"net/http"
)

// JSON: tulis isi sebagai JSON dengan status tertentu (isi nil → "null").
func JSON(w http.ResponseWriter, status int, isi any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if isi == nil {
		_, _ = w.Write([]byte("null"))
		return
	}
	_ = json.NewEncoder(w).Encode(isi)
}

// Galat: tanggapan galat standar — pesan dalam bahasa pengguna.
func Galat(w http.ResponseWriter, status int, pesan string) {
	JSON(w, status, map[string]string{"pesan": pesan})
}
