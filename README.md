# DrawViz

**Interactive Technical Drawing Studio** — A browser-based 3D isometric and technical drawing application built with React, TypeScript, and Three.js.

## Features

- **3D Isometric Drawing** — Draw lines, arcs, cylinders, and spheres on a snapping isometric grid
- **Multi-View Projections** — Orthographic front, top, and right camera views alongside the main 3D viewport
- **Selection Modes** — Vertex, edge, and face selection with Blender-style keyboard shortcuts (`1`, `2`, `3`)
- **Transform Gizmos** — Translate (`G`), rotate (`R`), and scale (`S`) selected geometry
- **Grouping** — Group entities into meshes, planes, or vertex groups; transform as a unit
- **Face Coloring** — Assign colors to individual faces from the property panel
- **Technical Drawing Export** — Export professional PDF and SVG technical drawings with:
  - Configurable multi-view layouts (Front, Top, Right, Isometric)
  - Standard title blocks with project metadata
  - Scale presets (1:1, 1:2, 2:1, etc.) and custom scaling
  - Draggable view positioning on the drawing sheet
- **Primitives** — One-click cube, cylinder, and sphere insertion
- **Undo / Redo** — Full history stack (up to 30 snapshots)
- **Auto-Save** — Drawing state is cached to `localStorage` and restored on reload
- **Dark / Light Theme** — Toggle with a single click
- **Project Files** — Save and load `.drawviz` project files (JSON-based)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + TypeScript |
| 3D Engine | Three.js |
| Build Tool | Vite |
| Icons | Lucide React |
| PDF Generation | jsPDF (via export module) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Install & Run

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
cd frontend
npm run build
npm run preview
```

The optimized output is written to `frontend/dist/`.

## Project Structure

```
frontend/
├── index.html              # Entry HTML
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx             # React root
    ├── App.tsx              # Application shell & keyboard shortcuts
    ├── state/
    │   └── drawingState.ts  # Central state hook (entities, selection, history, localStorage)
    ├── canvas/
    │   ├── Three3DCanvas.tsx       # Main Three.js 3D viewport
    │   ├── IsometricCanvas.tsx     # 2D isometric canvas (legacy)
    │   ├── ThreeOrthoViewport.tsx  # Orthographic sub-viewports
    │   ├── OrientationGizmo.tsx    # 3D orientation cube
    │   └── AxisIndicator.tsx       # Axis helper overlay
    ├── components/
    │   ├── TopBar.tsx         # Toolbar (undo, redo, save, open, export, theme)
    │   ├── ToolPanel.tsx      # Left-side drawing tools & primitives
    │   ├── PropertyPanel.tsx  # Right-side inspector (selection, groups, styling)
    │   ├── ExportModal.tsx    # PDF/SVG technical drawing export dialog
    │   ├── OrthoPanel.tsx     # Bottom collapsible orthographic views
    │   ├── StatusBar.tsx      # Bottom status bar (zoom, snap, isoplane)
    │   ├── SettingsModal.tsx  # App settings dialog
    │   └── InstructionsPanel.tsx  # Lesson/challenge instructions
    ├── geometry/
    │   ├── technicalDrawing.ts  # Multi-view projection & layout engine
    │   ├── isometric.ts         # Isometric math & coordinate transforms
    │   ├── orthographic.ts      # Orthographic projection utilities
    │   ├── snapping.ts          # Grid & endpoint snapping logic
    │   ├── circle3d.ts          # Cylinder/circle 3D geometry helpers
    │   └── faces.ts             # Face extraction from edges
    ├── export/
    │   ├── pdfGenerator.ts      # PDF rendering pipeline
    │   └── svgGenerator.ts      # SVG rendering pipeline
    ├── types/
    │   └── drawing.ts           # TypeScript interfaces & types
    ├── lessons/
    │   └── curriculum.ts        # Built-in lessons & challenges
    └── styles/                  # CSS modules
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `L` | Line tool |
| `C` | Circle tool |
| `A` | Arc tool |
| `Y` | Cylinder tool |
| `V` | Select tool |
| `X` | Eraser tool |
| `1` / `2` / `3` | Vertex / Edge / Face selection mode |
| `G` | Translate gizmo |
| `R` | Rotate gizmo |
| `S` | Scale gizmo |
| `Ctrl+A` | Select all |
| `Ctrl+G` | Group selection |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save project |
| `Ctrl+E` | Open export dialog |
| `Delete` | Delete selected |
| `Escape` | Deselect all |

## License

MIT
