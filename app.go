package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"DrawViz/backend/models"
	"DrawViz/backend/storage"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// OpenFileDialog prompts user to pick a .drawviz project file
func (a *App) OpenFileDialog() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open DrawViz Project",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "DrawViz Projects (*.drawviz)",
				Pattern:     "*.drawviz",
			},
			{
				DisplayName: "JSON Files (*.json)",
				Pattern:     "*.json",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	})
	if err != nil {
		return "", err
	}
	return filePath, nil
}

// SaveFileDialog prompts user to choose a destination path for saving a project
func (a *App) SaveFileDialog(defaultName string) (string, error) {
	if defaultName == "" {
		defaultName = "drawing.drawviz"
	}
	if !strings.HasSuffix(defaultName, ".drawviz") {
		defaultName += ".drawviz"
	}

	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save DrawViz Project",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "DrawViz Projects (*.drawviz)",
				Pattern:     "*.drawviz",
			},
		},
	})
	if err != nil {
		return "", err
	}
	return filePath, nil
}

// SaveProject saves the project struct to the specified file path
func (a *App) SaveProject(filePath string, project models.DrawVizProject) error {
	if filePath == "" {
		return fmt.Errorf("file path cannot be empty")
	}
	return storage.SaveProject(filePath, &project)
}

// LoadProject loads a project struct from the specified file path
func (a *App) LoadProject(filePath string) (*models.DrawVizProject, error) {
	if filePath == "" {
		return nil, fmt.Errorf("file path cannot be empty")
	}
	return storage.LoadProject(filePath)
}

// ExportSVG saves an SVG export to disk
func (a *App) ExportSVG(filePath string, svgContent string) error {
	if filePath == "" {
		var err error
		filePath, err = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			Title:           "Export SVG",
			DefaultFilename: "drawing.svg",
			Filters: []runtime.FileFilter{
				{
					DisplayName: "SVG Vector (*.svg)",
					Pattern:     "*.svg",
				},
			},
		})
		if err != nil || filePath == "" {
			return err
		}
	}
	return storage.SaveRawFile(filePath, []byte(svgContent))
}

// ExportPNG saves a base64 encoded PNG to disk
func (a *App) ExportPNG(filePath string, base64Png string) error {
	if filePath == "" {
		var err error
		filePath, err = runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			Title:           "Export PNG",
			DefaultFilename: "drawing.png",
			Filters: []runtime.FileFilter{
				{
					DisplayName: "PNG Image (*.png)",
					Pattern:     "*.png",
				},
			},
		})
		if err != nil || filePath == "" {
			return err
		}
	}

	// Remove data URI scheme prefix if present
	if idx := strings.Index(base64Png, ","); idx != -1 {
		base64Png = base64Png[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(base64Png)
	if err != nil {
		return fmt.Errorf("invalid base64 image data: %w", err)
	}

	return storage.SaveRawFile(filePath, data)
}

// GetDefaultProject returns a fresh project model
func (a *App) GetDefaultProject() *models.DrawVizProject {
	return models.DefaultProject()
}
