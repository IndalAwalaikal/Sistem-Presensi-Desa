package domain

import (
	"fmt"
	"math"
	"time"
)

// ---------------------------------------------------------------------
// Konfigurasi kantor & jadwal
// ---------------------------------------------------------------------

type GeoPoint struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type OfficeLocation struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Point        GeoPoint `json:"point"`
	RadiusMeters int      `json:"radiusMeters"`
}

// WorkSchedule: bentuk yang dikonsumsi frontend (camelCase).
type WorkSchedule struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	CheckInStart    string `json:"checkInStart"`    // "07:30"
	CheckInDeadline string `json:"checkInDeadline"` // lewat jam ini = terlambat
	CheckOutStart   string `json:"checkOutStart"`   // sebelum jam ini = pulang cepat
	CheckOutEnd     string `json:"checkOutEnd"`     // setelah jam ini = lebih kerja
	WorkDays        []int  `json:"workDays"`        // 0=Minggu … 6=Sabtu
}

// JadwalKhusus: penyesuaian jam kerja untuk rentang tanggal tertentu (mis. Ramadan).
type JadwalKhusus struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	StartDate       string `json:"startDate"`       // "YYYY-MM-DD"
	EndDate         string `json:"endDate"`         // "YYYY-MM-DD"
	CheckInStart    string `json:"checkInStart"`    // "08:00"
	CheckInDeadline string `json:"checkInDeadline"` // "08:30"
	CheckOutStart   string `json:"checkOutStart"`   // "15:00"
	CheckOutEnd     string `json:"checkOutEnd"`     // "16:00"
	WorkDays        []int  `json:"workDays"`        // [1,2,3,4,5]
	CreatedBy       string `json:"createdBy"`
	CreatedAt       string `json:"createdAt"`
}

func (j JadwalKhusus) KeWorkSchedule() WorkSchedule {
	return WorkSchedule{
		ID:              j.ID,
		Name:            j.Name,
		CheckInStart:    j.CheckInStart,
		CheckInDeadline: j.CheckInDeadline,
		CheckOutStart:   j.CheckOutStart,
		CheckOutEnd:     j.CheckOutEnd,
		WorkDays:        j.WorkDays,
	}
}

type KonfigurasiAktif struct {
	Office            OfficeLocation `json:"office"`
	Schedule          WorkSchedule   `json:"schedule"`
	MaxAccuracyMeters int            `json:"maxAccuracyMeters"`
}

// ---------------------------------------------------------------------
// Waktu WITA — seluruh tanggal presensi memakai Asia/Makassar (+08:00),
// bukan zona waktu server.
// ---------------------------------------------------------------------

var WITA = time.FixedZone("WITA", 8*60*60)

func TanggalISO(t time.Time) string { return t.In(WITA).Format("2006-01-02") }

func MenitOf(hhmm string) int {
	var h, m int
	if _, err := fmt.Sscanf(hhmm, "%d:%d", &h, &m); err != nil {
		return -1
	}
	return h*60 + m
}

func jamMenitWITA(t time.Time) int {
	return t.In(WITA).Hour()*60 + t.In(WITA).Minute()
}

// DistanceMeters: jarak haversine antara dua titik (meter).
func DistanceMeters(a, b GeoPoint) float64 {
	const R = 6_371_000.0
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }
	dLat := toRad(b.Latitude - a.Latitude)
	dLon := toRad(b.Longitude - a.Longitude)
	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(a.Latitude))*math.Cos(toRad(b.Latitude))*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * R * math.Asin(math.Sqrt(h))
}

// EvaluateGeofence: vonis posisi terhadap radius kantor dengan akurasi GPS.
func EvaluateGeofence(userPoint GeoPoint, accuracy float64, office OfficeLocation, maxAccuracy float64) GeofenceCheck {
	d := DistanceMeters(userPoint, office.Point)
	if accuracy > maxAccuracy {
		return GeofenceCheck{Verdict: Inaccurate, DistanceMeters: d, AccuracyMeters: accuracy}
	}
	v := Outside
	if d <= float64(office.RadiusMeters) {
		v = Inside
	}
	return GeofenceCheck{Verdict: v, DistanceMeters: d, AccuracyMeters: accuracy}
}
