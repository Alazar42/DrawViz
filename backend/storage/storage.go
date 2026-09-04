package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"DrawViz/backend/models"
)

// SaveProject serializes and writes a DrawViz project to disk
func SaveProject(path string, project *models.DrawVizProject) error {
	if project == nil {
		return fmt.Errorf("cannot save nil project")
	}

	project.Metadata.Modified = time.Now().Format(time.RFC3339)

	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode project JSON: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write project file: %w", err)
	}

	return nil
}

// LoadProject reads and deserializes a DrawViz project from disk
func LoadProject(path string) (*models.DrawVizProject, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var project models.DrawVizProject
	if err := json.Unmarshal(data, &project); err != nil {
		return nil, fmt.Errorf("failed to parse project JSON: %w", err)
	}

	return &project, nil
}

// SaveRawFile saves raw bytes such as SVG or exported image data
func SaveRawFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}
