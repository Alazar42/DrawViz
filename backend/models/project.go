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
	GroupID string    `json:"groupId,omitempty"`
}

// DrawingArc represents a curved arc or circle
type DrawingArc struct {
	ID         string    `json:"id"`
	Center     Point3D   `json:"center"`
	Radius     float64   `json:"radius"`
	StartAngle float64   `json:"startAngle,omitempty"`
	EndAngle   float64   `json:"endAngle,omitempty"`
	Normal     *Point3D  `json:"normal,omitempty"`
	StartPoint *Point3D  `json:"startPoint,omitempty"`
	EndPoint   *Point3D  `json:"endPoint,omitempty"`
	BulgeDir   string    `json:"bulgeDir,omitempty"`
	LayerID    string    `json:"layerId"`
	Style      LineStyle `json:"style"`
	GroupID    string    `json:"groupId,omitempty"`
}

// DrawingCylinder represents a 3D cylindrical primitive
type DrawingCylinder struct {
	ID      string   `json:"id"`
	Center  Point3D  `json:"center"`
	Radius  float64  `json:"radius"`
	Height  float64  `json:"height"`
	Normal  *Point3D `json:"normal,omitempty"`
	LayerID string   `json:"layerId"`
	GroupID string   `json:"groupId,omitempty"`
}

// DrawingSphere represents a 3D spherical primitive
type DrawingSphere struct {
	ID      string  `json:"id"`
	Center  Point3D `json:"center"`
	Radius  float64 `json:"radius"`
	LayerID string  `json:"layerId"`
	GroupID string  `json:"groupId,omitempty"`
}

// EntityGroup represents a logical group of drawing entities
type EntityGroup struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Type      string   `json:"type"` // mesh, plane, edge, vertex
	MemberIDs []string `json:"memberIds"`
}

// SnapModes controls active snapping targets
type SnapModes struct {
	Vertex   bool `json:"vertex"`
	Midpoint bool `json:"midpoint"`
	Edge     bool `json:"edge"`
	Face     bool `json:"face"`
	Grid     bool `json:"grid"`
}

// ViewportProjectConfig preserves camera and workspace configs
type ViewportProjectConfig struct {
	Projection        string     `json:"projection"` // orthographic or perspective
	Theme             string     `json:"theme,omitempty"`
	ActiveElevation   float64    `json:"activeElevation,omitempty"`
	MagnetSnapEnabled bool       `json:"magnetSnapEnabled,omitempty"`
	SnapModes         *SnapModes `json:"snapModes,omitempty"`
	SolidShading      bool       `json:"solidShading,omitempty"`
}

// GridSettings defines drafting canvas grid settings
type GridSettings struct {
	UnitSize        float64 `json:"unitSize"`
	SnapToGrid      bool    `json:"snapToGrid"`
	SnapToIsometric bool    `json:"snapToIsometric"`
	SnapToEndpoints bool    `json:"snapToEndpoints"`
	ShowGrid        bool    `json:"showGrid"`
	GridType        string  `json:"gridType"`
}

// Layer represents a CAD layer for organizing drawing elements
type Layer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Visible bool   `json:"visible"`
	Locked  bool   `json:"locked"`
	Color   string `json:"color"`
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
	Version        string                 `json:"version"`
	Metadata       ProjectMetadata        `json:"metadata"`
	GridSettings   GridSettings           `json:"gridSettings"`
	Layers         []Layer                `json:"layers"`
	Lines          []DrawingLine          `json:"lines"`
	Arcs           []DrawingArc           `json:"arcs,omitempty"`
	Cylinders      []DrawingCylinder      `json:"cylinders,omitempty"`
	Spheres        []DrawingSphere        `json:"spheres,omitempty"`
	Groups         []EntityGroup          `json:"groups,omitempty"`
	ViewportConfig *ViewportProjectConfig `json:"viewportConfig,omitempty"`
	ActiveLessonID string                 `json:"activeLessonId,omitempty"`
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
