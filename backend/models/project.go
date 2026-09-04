package models

import "time"

// Point3D represents a point in logical isometric drafting coordinates
type Point3D struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// LineStyle defines visual rendering properties for a line
type LineStyle struct {
	Stroke      string  `json:"stroke,omitempty"`
	StrokeWidth float64 `json:"strokeWidth,omitempty"`
	LineType    string  `json:"lineType,omitempty"` // solid, dashed, centerline, hidden
}

// DrawingLine represents a single drawn vector entity in logical coordinates
type DrawingLine struct {
	ID      string    `json:"id"`
	Start   Point3D   `json:"start"`
	End     Point3D   `json:"end"`
	LayerID string    `json:"layerId"`
	Style   LineStyle `json:"style"`
}

// Layer defines a logical grouping of drawing lines
type Layer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Visible bool   `json:"visible"`
	Locked  bool   `json:"locked"`
	Color   string `json:"color"`
}

// GridSettings controls drafting grid display and snapping
type GridSettings struct {
	UnitSize        float64 `json:"unitSize"`
	SnapToGrid      bool    `json:"snapToGrid"`
	SnapToIsometric bool    `json:"snapToIsometric"`
	SnapToEndpoints bool    `json:"snapToEndpoints"`
	ShowGrid        bool    `json:"showGrid"`
	GridType        string  `json:"gridType"` // "isometric" or "orthographic"
}

// ProjectMetadata contains file information
type ProjectMetadata struct {
	Name     string `json:"name"`
	Author   string `json:"author"`
	Created  string `json:"created"`
	Modified string `json:"modified"`
	Mode     string `json:"mode"` // "practice", "lessons", "challenges"
}

// DrawVizProject represents a complete saved project
type DrawVizProject struct {
	Version        string          `json:"version"`
	Metadata       ProjectMetadata `json:"metadata"`
	GridSettings   GridSettings    `json:"gridSettings"`
	Layers         []Layer         `json:"layers"`
	Lines          []DrawingLine   `json:"lines"`
	ActiveLessonID string          `json:"activeLessonId,omitempty"`
}

// DefaultProject creates a blank project with initial defaults
func DefaultProject() *DrawVizProject {
	now := time.Now().Format(time.RFC3339)
	return &DrawVizProject{
		Version: "1.0.0",
		Metadata: ProjectMetadata{
			Name:     "Untitled Drawing",
			Author:   "Student",
			Created:  now,
			Modified: now,
			Mode:     "practice",
		},
		GridSettings: GridSettings{
			UnitSize:        1.0,
			SnapToGrid:      true,
			SnapToIsometric: true,
			SnapToEndpoints: true,
			ShowGrid:        true,
			GridType:        "isometric",
		},
		Layers: []Layer{
			{
				ID:      "layer-1",
				Name:    "Layer 1",
				Visible: true,
				Locked:  false,
				Color:   "#111827",
			},
		},
		Lines: []DrawingLine{},
	}
}
