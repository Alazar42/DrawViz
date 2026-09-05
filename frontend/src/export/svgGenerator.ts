import {
  TechnicalSheetConfig,
  SheetLayoutResult,
  ProjectionStandard,
} from '../geometry/technicalDrawing';

/**
 * Generates vector projection cone symbol (ISO 128 / ASME Y14.3)
 */
function generateProjectionSymbolSvg(
  x: number,
  y: number,
  width: number,
  height: number,
  standard: ProjectionStandard
): string {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rBig = 4.2;
  const rSmall = 2.1;
  const coneLength = 8.5;
  const gap = 3.5;

  let coneSvg = '';
  let circlesSvg = '';

  if (standard === 'third_angle') {
    // Third Angle (ANSI / US): Cone on LEFT, Circles on RIGHT
    const coneRightX = cx - gap / 2;
    const coneLeftX = coneRightX - coneLength;

    coneSvg = `
      <!-- Third Angle Cone -->
      <polygon points="${coneLeftX},${cy - rSmall} ${coneRightX},${cy - rBig} ${coneRightX},${cy + rBig} ${coneLeftX},${cy + rSmall}"
        fill="none" stroke="#000000" stroke-width="0.3" stroke-linejoin="round" />
      <line x1="${coneLeftX - 3}" y1="${cy}" x2="${coneRightX + 1}" y2="${cy}"
        stroke="#64748b" stroke-width="0.2" stroke-dasharray="4,1,1,1" />
    `;

    const circleCx = cx + gap / 2 + rBig;
    circlesSvg = `
      <!-- Concentric Circles -->
      <circle cx="${circleCx}" cy="${cy}" r="${rSmall}" fill="none" stroke="#000000" stroke-width="0.3" />
      <circle cx="${circleCx}" cy="${cy}" r="${rBig}" fill="none" stroke="#000000" stroke-width="0.3" />
      <line x1="${circleCx - rBig - 2}" y1="${cy}" x2="${circleCx + rBig + 2}" y2="${cy}"
        stroke="#64748b" stroke-width="0.2" stroke-dasharray="4,1,1,1" />
      <line x1="${circleCx}" y1="${cy - rBig - 2}" x2="${circleCx}" y2="${cy + rBig + 2}"
        stroke="#64748b" stroke-width="0.2" stroke-dasharray="4,1,1,1" />
    `;
  } else {
    // First Angle (ISO / European): Circles on LEFT, Cone on RIGHT
    const circleCx = cx - gap / 2 - rBig;
    circlesSvg = `
      <!-- Concentric Circles -->
      <circle cx="${circleCx}" cy="${cy}" r="${rSmall}" fill="none" stroke="#000000" stroke-width="0.3" />
      <circle cx="${circleCx}" cy="${cy}" r="${rBig}" fill="none" stroke="#000000" stroke-width="0.3" />
      <line x1="${circleCx - rBig - 2}" y1="${cy}" x2="${circleCx + rBig + 2}" y2="${cy}"
        stroke="#64748b" stroke-width="0.2" stroke-dasharray="4,1,1,1" />
      <line x1="${circleCx}" y1="${cy - rBig - 2}" x2="${circleCx}" y2="${cy + rBig + 2}"
        stroke="#64748b" stroke-width="0.2" stroke-dasharray="4,1,1,1" />
    `;

    const coneLeftX = cx + gap / 2;
    const coneRightX = coneLeftX + coneLength;
    coneSvg = `
      <!-- First Angle Cone -->
      <polygon points="${coneLeftX},${cy - rBig} ${coneRightX},${cy - rSmall} ${coneRightX},${cy + rSmall} ${coneLeftX},${cy + rBig}"
        fill="none" stroke="#000000" stroke-width="0.3" stroke-linejoin="round" />
      <line x1="${coneLeftX - 1}" y1="${cy}" x2="${coneRightX + 3}" y2="${cy}"
        stroke="#64748b" stroke-width="0.2" stroke-dasharray="4,1,1,1" />
    `;
  }

  return `<g id="projection-cone-symbol">${coneSvg}${circlesSvg}</g>`;
}

/**
 * Escapes XML strings for safe SVG attribute and text values
 */
function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates standard vector Technical Drawing SVG string
 */
export function generateTechnicalDrawingSvg(
  config: TechnicalSheetConfig,
  layout: SheetLayoutResult
): string {
  const { paper, border, titleBlockBox, views, zones } = layout;
  const tb = config.titleBlock;

  // 1. Grid Zone Markers along borders (ISO 5457)
  let zonesSvg = '';
  if (config.showGridZones) {
    const tickLen = 2.5;
    const fontSize = 2.8;

    // Top & Bottom Columns (1, 2, 3...)
    for (const col of zones.cols) {
      zonesSvg += `
        <line x1="${col.x}" y1="${border.y}" x2="${col.x}" y2="${border.y + tickLen}" stroke="#000000" stroke-width="0.3" />
        <line x1="${col.x}" y1="${border.y + border.height - tickLen}" x2="${col.x}" y2="${border.y + border.height}" stroke="#000000" stroke-width="0.3" />
        <text x="${col.x}" y="${border.y - 2.5}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" fill="#000000">${col.label}</text>
        <text x="${col.x}" y="${border.y + border.height + 5}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" fill="#000000">${col.label}</text>
      `;
    }

    // Left & Right Rows (A, B, C...)
    for (const row of zones.rows) {
      zonesSvg += `
        <line x1="${border.x}" y1="${row.y}" x2="${border.x + tickLen}" y2="${row.y}" stroke="#000000" stroke-width="0.3" />
        <line x1="${border.x + border.width - tickLen}" y1="${row.y}" x2="${border.x + border.width}" y2="${row.y}" stroke="#000000" stroke-width="0.3" />
        <text x="${border.x - 4}" y="${row.y + 1}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" fill="#000000">${row.label}</text>
        <text x="${border.x + border.width + 4}" y="${row.y + 1}" font-size="${fontSize}" font-family="sans-serif" text-anchor="middle" fill="#000000">${row.label}</text>
      `;
    }
  }

  // 2. Title Block (ISO 7200 / ASME Y14.1)
  const tbx = titleBlockBox.x;
  const tby = titleBlockBox.y;
  const tbw = titleBlockBox.width;
  const tbh = titleBlockBox.height;

  const c0 = tbx;
  const c1 = tbx + 40;
  const c2 = tbx + 80;
  const c3 = tbx + 120;
  const c4 = tbx + tbw;

  const symbolSvg = config.showProjectionSymbol
    ? generateProjectionSymbolSvg(c3, tby + 5, c4 - c3, 20, config.projection)
    : '';

  const titleBlockSvg = `
    <g id="title-block" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
      <!-- Title Block Outer Frame -->
      <rect x="${tbx}" y="${tby}" width="${tbw}" height="${tbh}" fill="#ffffff" stroke="#000000" stroke-width="0.7" />

      <!-- Horizontal Dividers -->
      <line x1="${c0}" y1="${tby + 11}" x2="${c3}" y2="${tby + 11}" stroke="#000000" stroke-width="0.35" />
      <line x1="${c0}" y1="${tby + 25}" x2="${c4}" y2="${tby + 25}" stroke="#000000" stroke-width="0.35" />
      <line x1="${c0}" y1="${tby + 35.5}" x2="${c4}" y2="${tby + 35.5}" stroke="#000000" stroke-width="0.35" />

      <!-- Vertical Dividers -->
      <line x1="${c1}" y1="${tby + 25}" x2="${c1}" y2="${tby + tbh}" stroke="#000000" stroke-width="0.35" />
      <line x1="${c2}" y1="${tby + 25}" x2="${c2}" y2="${tby + tbh}" stroke="#000000" stroke-width="0.35" />
      <line x1="${c3}" y1="${tby}" x2="${c3}" y2="${tby + tbh}" stroke="#000000" stroke-width="0.35" />

      <!-- Row 1: Company / Organization -->
      <text x="${c0 + 3}" y="${tby + 3.8}" font-size="1.8" font-weight="600" fill="#64748b">ORGANIZATION / COMPANY</text>
      <text x="${c0 + 3}" y="${tby + 8.2}" font-size="3.4" font-weight="700" fill="#111827">${escapeXml(tb.company || 'DrawViz Technical Studio')}</text>

      <!-- Row 2: Drawing Title -->
      <text x="${c0 + 3}" y="${tby + 14.5}" font-size="1.8" font-weight="600" fill="#64748b">DRAWING TITLE</text>
      <text x="${c0 + 3}" y="${tby + 20.8}" font-size="4.2" font-weight="800" fill="#111827">${escapeXml(tb.title || 'TECHNICAL DRAWING')}</text>

      <!-- Projection Box (Top-Right) -->
      <text x="${c3 + 3}" y="${tby + 4.5}" font-size="1.8" font-weight="700" fill="#64748b">
        ${config.projection === 'third_angle' ? '3RD ANGLE PROJ.' : '1ST ANGLE PROJ.'}
      </text>
      ${symbolSvg}

      <!-- Row 3: DWG NO / DRAWN BY / SCALE / UNITS -->
      <text x="${c0 + 3}" y="${tby + 28.5}" font-size="1.8" font-weight="600" fill="#64748b">DRAWING NO.</text>
      <text x="${c0 + 3}" y="${tby + 32.8}" font-size="2.7" font-weight="700" fill="#111827">${escapeXml(tb.drawingNumber || 'DWG-1001')}</text>

      <text x="${c1 + 3}" y="${tby + 28.5}" font-size="1.8" font-weight="600" fill="#64748b">DRAWN BY</text>
      <text x="${c1 + 3}" y="${tby + 32.8}" font-size="2.7" font-weight="600" fill="#111827">${escapeXml(tb.drawnBy || 'ENGINEER')}</text>

      <text x="${c2 + 3}" y="${tby + 28.5}" font-size="1.8" font-weight="600" fill="#64748b">SCALE</text>
      <text x="${c2 + 3}" y="${tby + 32.8}" font-size="2.7" font-weight="700" fill="#111827">${escapeXml(tb.scaleText || (config.scaleMode === 'auto' ? 'NTS (FIT)' : config.scaleMode))}</text>

      <text x="${c3 + 3}" y="${tby + 28.5}" font-size="1.8" font-weight="600" fill="#64748b">UNITS</text>
      <text x="${c3 + 3}" y="${tby + 32.8}" font-size="2.7" font-weight="700" fill="#111827">${escapeXml(tb.units || 'mm')}</text>

      <!-- Row 4: REVISION / CHECKED BY / SHEET / DATE -->
      <text x="${c0 + 3}" y="${tby + 39.0}" font-size="1.8" font-weight="600" fill="#64748b">REVISION</text>
      <text x="${c0 + 3}" y="${tby + 43.0}" font-size="2.7" font-weight="700" fill="#111827">${escapeXml(tb.revision || 'REV A')}</text>

      <text x="${c1 + 3}" y="${tby + 39.0}" font-size="1.8" font-weight="600" fill="#64748b">CHECKED BY</text>
      <text x="${c1 + 3}" y="${tby + 43.0}" font-size="2.7" font-weight="600" fill="#111827">${escapeXml(tb.checkedBy || 'APPROVED')}</text>

      <text x="${c2 + 3}" y="${tby + 39.0}" font-size="1.8" font-weight="600" fill="#64748b">SHEET</text>
      <text x="${c2 + 3}" y="${tby + 43.0}" font-size="2.7" font-weight="700" fill="#111827">1 OF 1</text>

      <text x="${c3 + 3}" y="${tby + 39.0}" font-size="1.8" font-weight="600" fill="#64748b">DATE</text>
      <text x="${c3 + 3}" y="${tby + 43.0}" font-size="2.7" font-weight="600" fill="#111827">${escapeXml(tb.date || new Date().toISOString().slice(0, 10))}</text>
    </g>
  `;

  // 3. Views and Entities
  let viewsSvg = '';
  for (const v of views) {
    let polygonsSvg = '';
    for (const poly of v.polygons) {
      if (poly.points.length < 3) continue;
      const ptsStr = poly.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      polygonsSvg += `<polygon points="${ptsStr}" fill="${poly.color}" fill-opacity="${poly.opacity}" stroke="none" />\n`;
    }

    let linesSvg = '';
    for (const l of v.lines) {
      if (l.type === 'hidden' && !config.showHiddenLines) continue;

      let dashStr = '';
      if (l.type === 'hidden') {
        dashStr = 'stroke-dasharray="2, 1.2"';
      } else if (l.type === 'center') {
        dashStr = 'stroke-dasharray="5, 1.2, 1.2, 1.2"';
      }

      linesSvg += `
        <line x1="${l.start.x.toFixed(2)}" y1="${l.start.y.toFixed(2)}"
              x2="${l.end.x.toFixed(2)}" y2="${l.end.y.toFixed(2)}"
              stroke="${l.color || (l.type === 'center' ? '#64748b' : '#111827')}"
              stroke-width="${l.strokeWidth || 0.5}"
              stroke-linecap="round" ${dashStr} />
      `;
    }

    let circlesSvg = '';
    for (const c of v.circles) {
      circlesSvg += `
        <circle cx="${c.center.x.toFixed(2)}" cy="${c.center.y.toFixed(2)}" r="${c.radius.toFixed(2)}"
                fill="none" stroke="${c.color || '#111827'}" stroke-width="0.5" />
      `;
    }

    // View Label placed neatly below the geometry
    const labelX = v.labelPos ? v.labelPos.x : (v.box.x + v.box.width / 2);
    const labelY = v.labelPos ? v.labelPos.y : (v.box.y + v.box.height - 2);

    viewsSvg += `
      <g id="view-${v.id}" class="view-item" data-view-id="${v.id}">
        <!-- View Title Label -->
        <text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              font-size="3.2" font-weight="700" text-anchor="middle" fill="#111827" letter-spacing="0.4">
          ${v.title}
        </text>
        <!-- Geometry -->
        <g id="polygons-${v.id}">${polygonsSvg}</g>
        <g id="lines-${v.id}">${linesSvg}</g>
        <g id="circles-${v.id}">${circlesSvg}</g>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${paper.width} ${paper.height}"
     width="${paper.width}mm" height="${paper.height}mm">
  <defs>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    </style>
  </defs>

  <!-- Sheet Background -->
  <rect width="100%" height="100%" fill="#ffffff" />

  <!-- Outer Border (ISO 5457: 20mm left margin, 10mm other margins) -->
  <rect x="${border.x}" y="${border.y}" width="${border.width}" height="${border.height}"
        fill="none" stroke="#000000" stroke-width="0.7" />

  <!-- Zone Markers -->
  <g id="zones">${zonesSvg}</g>

  <!-- Views & CAD Geometry -->
  <g id="cad-views">${viewsSvg}</g>

  <!-- Title Block -->
  ${titleBlockSvg}
</svg>`;
}
