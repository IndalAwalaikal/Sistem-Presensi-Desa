package domain

// ---------------------------------------------------------------------
// Pendaftaran biometrik wajah (enrollment)
// ---------------------------------------------------------------------

type EnrollmentStatus string

const (
	EnrDraf      EnrollmentStatus = "DRAFT"
	EnrDikirim   EnrollmentStatus = "SUBMITTED"
	EnrDisetujui EnrollmentStatus = "APPROVED"
	EnrDitolak   EnrollmentStatus = "REJECTED"
)

type EnrollmentPhoto struct {
	DataURL    string  `json:"dataUrl"`
	Quality    float64 `json:"quality,omitempty"` // metadata lama; tidak dipercaya untuk keputusan biometrik
	CapturedAt string  `json:"capturedAt"`
}

type FaceEnrollment struct {
	ID           string            `json:"id"`
	UserID       string            `json:"userId"`
	UserName     string            `json:"userName"`
	Status       EnrollmentStatus  `json:"status"`
	Photos       []EnrollmentPhoto `json:"photos"`
	SubmittedAt  *string           `json:"submittedAt,omitempty"`
	ReviewedAt   *string           `json:"reviewedAt,omitempty"`
	ReviewerNote *string           `json:"reviewerNote,omitempty"`
}

const (
	EnrollmentMinFoto = 3
	EnrollmentMaxFoto = 5
)
