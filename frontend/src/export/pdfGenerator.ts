import {
  TechnicalSheetConfig,
  SheetLayoutResult,
  ProjectionStandard,
} from '../geometry/technicalDrawing';

const MM_TO_PT = 72 / 25.4; // 1 mm = 2.834645669 points

function parseHexColor(hex: string): [number, number, number] {
  let clean = (hex || '#000000').replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [0, 0, 0];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [
    Math.round(r * 1000) / 1000,
    Math.round(g * 1000) / 1000,
    Math.round(b * 1000) / 1000,
  ];
}

function escapePdfText(str: string): string {
  return (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\u0080-\uffff]/g, '?');
}

/**
 * Generates a pure vector PDF 1.4 document Blob
 */
export function generateTechnicalDrawingPdf(
  config: TechnicalSheetConfig,
  layout: SheetLayoutResult
): Blob {
  const { paper, border, titleBlockBox, views, zones } = layout;
  const tb = config.titleBlock;

  const pageW = paper.width * MM_TO_PT;
  const pageH = paper.height * MM_TO_PT;

  const toPtX = (xMm: number) => xMm * MM_TO_PT;
  // Convert mm from top-left to PDF points from bottom-left
  const toPtY = (yMm: number) => (paper.height - yMm) * MM_TO_PT;

  const ops: string[] = [];

  // Helper for line drawing
  const addLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidthMm: number,
    colorHex: string = '#000000',
    dashPattern: number[] = []
  ) => {
    const [r, g, b] = parseHexColor(colorHex);
    const wPt = lineWidthMm * MM_TO_PT;
    const dashStr = dashPattern.length > 0
      ? `[${dashPattern.map((d) => (d * MM_TO_PT).toFixed(2)).join(' ')}] 0 d`
      : '[] 0 d';

    ops.push(
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`,
      `${wPt.toFixed(2)} w`,
      '1 J', // round cap
      '1 j', // round join
      dashStr,
      `${toPtX(x1).toFixed(2)} ${toPtY(y1).toFixed(2)} m`,
      `${toPtX(x2).toFixed(2)} ${toPtY(y2).toFixed(2)} l`,
      'S'
    );
  };

  // Helper for rectangle
  const addRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    lineWidthMm: number,
    strokeColorHex: string = '#000000',
    fillColorHex?: string
  ) => {
    const [sr, sg, sb] = parseHexColor(strokeColorHex);
    const wPt = lineWidthMm * MM_TO_PT;
    ops.push(
      '[] 0 d',
      `${wPt.toFixed(2)} w`,
      `${sr.toFixed(3)} ${sg.toFixed(3)} ${sb.toFixed(3)} RG`
    );

    const rx = toPtX(x);
    const ry = toPtY(y + h); // bottom-left in PDF
    const rw = w * MM_TO_PT;
    const rh = h * MM_TO_PT;

    if (fillColorHex) {
      const [fr, fg, fb] = parseHexColor(fillColorHex);
      ops.push(
        `${fr.toFixed(3)} ${fg.toFixed(3)} ${fb.toFixed(3)} rg`,
        `${rx.toFixed(2)} ${ry.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re`,
        'B'
      );
    } else {
      ops.push(
        `${rx.toFixed(2)} ${ry.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re`,
        'S'
      );
    }
  };

  // Helper for text
  const addText = (
    text: string,
    xMm: number,
    yMm: number,
    fontSizeMm: number,
    bold: boolean = false,
    colorHex: string = '#111827',
    align: 'left' | 'center' | 'right' = 'left'
  ) => {
    if (!text) return;
    const [r, g, b] = parseHexColor(colorHex);
    const fontName = bold ? '/F2' : '/F1';
    const fontPt = fontSizeMm * MM_TO_PT;

    let posX = toPtX(xMm);
    const posY = toPtY(yMm);

    // Approximate text centering adjustment
    if (align === 'center') {
      const approxW = text.length * fontPt * 0.28;
      posX -= approxW;
    } else if (align === 'right') {
      const approxW = text.length * fontPt * 0.55;
      posX -= approxW;
    }

    ops.push(
      'BT',
      `${fontName} ${fontPt.toFixed(1)} Tf`,
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
      `1 0 0 1 ${posX.toFixed(2)} ${posY.toFixed(2)} Tm`,
      `(${escapePdfText(text)}) Tj`,
      'ET'
    );
  };

  // Helper for circle (via 4 Bézier curves)
  const addCircle = (
    cxMm: number,
    cyMm: number,
    radiusMm: number,
    lineWidthMm: number,
    strokeColorHex: string = '#000000',
    fillColorHex?: string
  ) => {
    const cx = toPtX(cxMm);
    const cy = toPtY(cyMm);
    const r = radiusMm * MM_TO_PT;
    const k = r * 0.5522847498;

    const [sr, sg, sb] = parseHexColor(strokeColorHex);
    const wPt = lineWidthMm * MM_TO_PT;
    ops.push(
      '[] 0 d',
      `${wPt.toFixed(2)} w`,
      `${sr.toFixed(3)} ${sg.toFixed(3)} ${sb.toFixed(3)} RG`
    );

    if (fillColorHex) {
      const [fr, fg, fb] = parseHexColor(fillColorHex);
      ops.push(`${fr.toFixed(3)} ${fg.toFixed(3)} ${fb.toFixed(3)} rg`);
    }

    ops.push(
      `${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`,
      `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`,
      `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`,
      `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`,
      `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`,
      'h',
      fillColorHex ? 'B' : 'S'
    );
  };

  // Helper for filled polygon
  const addPolygon = (
    pts: { x: number; y: number }[],
    colorHex: string
  ) => {
    if (pts.length < 3) return;
    const [r, g, b] = parseHexColor(colorHex);
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);

    const startX = toPtX(pts[0].x);
    const startY = toPtY(pts[0].y);
    ops.push(`${startX.toFixed(2)} ${startY.toFixed(2)} m`);

    for (let i = 1; i < pts.length; i++) {
      ops.push(`${toPtX(pts[i].x).toFixed(2)} ${toPtY(pts[i].y).toFixed(2)} l`);
    }
    ops.push('h', 'f');
  };

  // ==========================================
  // BUILD VECTOR PDF DRAWING COMMANDS
  // ==========================================

  // 1. Sheet Background (pure white)
  addRect(0, 0, paper.width, paper.height, 0, '#ffffff', '#ffffff');

  // 2. Outer Technical Border (ISO 5457: 20mm left margin, 10mm others, 0.7mm line)
  addRect(border.x, border.y, border.width, border.height, 0.7, '#000000');

  // 3. Zone Reference Markers
  if (config.showGridZones) {
    const tickLen = 2.2;
    for (const col of zones.cols) {
      addLine(col.x, border.y, col.x, border.y + tickLen, 0.3, '#000000');
      addLine(col.x, border.y + border.height - tickLen, col.x, border.y + border.height, 0.3, '#000000');
      addText(col.label, col.x, border.y - 1.5, 2.5, false, '#000000', 'center');
      addText(col.label, col.x, border.y + border.height + 4.5, 2.5, false, '#000000', 'center');
    }
    for (const row of zones.rows) {
      addLine(border.x, row.y, border.x + tickLen, row.y, 0.3, '#000000');
      addLine(border.x + border.width - tickLen, row.y, border.x + border.width, row.y, 0.3, '#000000');
      addText(row.label, border.x - 3.5, row.y + 1, 2.5, false, '#000000', 'center');
      addText(row.label, border.x + border.width + 3.5, row.y + 1, 2.5, false, '#000000', 'center');
    }
  }

  // 4. Title Block (ISO 7200 / ASME Y14.1)
  const tbx = titleBlockBox.x;
  const tby = titleBlockBox.y;
  const tbw = titleBlockBox.width;
  const tbh = titleBlockBox.height;
  const projSymbolWidth = 32;

  // Title block box and dividing lines
  addRect(tbx, tby, tbw, tbh, 0.6, '#000000', '#ffffff');
  addLine(tbx, tby + 10, tbx + tbw, tby + 10, 0.35, '#000000');
  addLine(tbx, tby + 24, tbx + tbw, tby + 24, 0.35, '#000000');
  addLine(tbx, tby + 33, tbx + tbw, tby + 33, 0.35, '#000000');

  addLine(tbx + tbw * 0.36, tby + 24, tbx + tbw * 0.36, tby + tbh, 0.3, '#000000');
  addLine(tbx + tbw * 0.65, tby + 24, tbx + tbw * 0.65, tby + tbh, 0.3, '#000000');
  addLine(tbx + tbw - projSymbolWidth, tby + 10, tbx + tbw - projSymbolWidth, tby + tbh, 0.3, '#000000');

  // Title Block Text
  addText('ORGANIZATION / COMPANY', tbx + 4, tby + 3.5, 2.0, true, '#64748b');
  addText(tb.company || 'DrawViz Technical Studio', tbx + 4, tby + 7.8, 3.4, true, '#111827');

  addText('DRAWING TITLE', tbx + 4, tby + 13.5, 2.0, true, '#64748b');
  addText(tb.title || 'TECHNICAL DRAWING', tbx + 4, tby + 19.8, 4.4, true, '#111827');

  addText('DRAWING NO.', tbx + 4, tby + 27, 1.8, true, '#64748b');
  addText(tb.drawingNumber || 'DWG-001', tbx + 4, tby + 31, 2.8, true, '#111827');

  addText('REVISION', tbx + 4, tby + 36, 1.8, true, '#64748b');
  addText(tb.revision || 'REV A', tbx + 4, tby + 39.8, 2.6, true, '#111827');

  addText('DRAWN BY', tbx + tbw * 0.36 + 3, tby + 27, 1.8, true, '#64748b');
  addText(tb.drawnBy || 'ENGINEER', tbx + tbw * 0.36 + 3, tby + 31, 2.6, false, '#111827');

  addText('CHECKED BY', tbx + tbw * 0.36 + 3, tby + 36, 1.8, true, '#64748b');
  addText(tb.checkedBy || 'APPROVED', tbx + tbw * 0.36 + 3, tby + 39.8, 2.6, false, '#111827');

  addText('SCALE', tbx + tbw * 0.65 + 3, tby + 27, 1.8, true, '#64748b');
  addText(tb.scaleText || (config.scaleMode === 'auto' ? 'NTS' : config.scaleMode), tbx + tbw * 0.65 + 3, tby + 31, 2.6, true, '#111827');

  addText('DATE / UNITS', tbx + tbw * 0.65 + 3, tby + 36, 1.8, true, '#64748b');
  addText(`${tb.date || new Date().toISOString().slice(0, 10)} (${tb.units || 'mm'})`, tbx + tbw * 0.65 + 3, tby + 39.8, 2.4, false, '#111827');

  // Projection Method & Symbol
  addText(
    config.projection === 'third_angle' ? '3RD ANGLE PROJ.' : '1ST ANGLE PROJ.',
    tbx + tbw - projSymbolWidth + 2,
    tby + 13.5,
    1.8,
    true,
    '#64748b'
  );

  // Projection Cone Symbol
  if (config.showProjectionSymbol) {
    const scx = tbx + tbw - projSymbolWidth / 2;
    const scy = tby + 27;
    const rBig = 4.0;
    const rSmall = 2.0;
    const coneLen = 8.0;
    const gap = 3.2;

    if (config.projection === 'third_angle') {
      const coneR = scx - gap / 2;
      const coneL = coneR - coneLen;
      // Cone
      addLine(coneL, scy - rSmall, coneR, scy - rBig, 0.3, '#000000');
      addLine(coneR, scy - rBig, coneR, scy + rBig, 0.3, '#000000');
      addLine(coneR, scy + rBig, coneL, scy + rSmall, 0.3, '#000000');
      addLine(coneL, scy + rSmall, coneL, scy - rSmall, 0.3, '#000000');
      // Centerline
      addLine(coneL - 2.5, scy, coneR + 1, scy, 0.2, '#64748b', [3, 1, 1, 1]);

      // Circles
      const ccx = scx + gap / 2 + rBig;
      addCircle(ccx, scy, rSmall, 0.3, '#000000');
      addCircle(ccx, scy, rBig, 0.3, '#000000');
      addLine(ccx - rBig - 2, scy, ccx + rBig + 2, scy, 0.2, '#64748b', [3, 1, 1, 1]);
      addLine(ccx, scy - rBig - 2, ccx, scy + rBig + 2, 0.2, '#64748b', [3, 1, 1, 1]);
    } else {
      // First Angle
      const ccx = scx - gap / 2 - rBig;
      addCircle(ccx, scy, rSmall, 0.3, '#000000');
      addCircle(ccx, scy, rBig, 0.3, '#000000');
      addLine(ccx - rBig - 2, scy, ccx + rBig + 2, scy, 0.2, '#64748b', [3, 1, 1, 1]);
      addLine(ccx, scy - rBig - 2, ccx, scy + rBig + 2, 0.2, '#64748b', [3, 1, 1, 1]);

      const coneL = scx + gap / 2;
      const coneR = coneL + coneLen;
      addLine(coneL, scy - rBig, coneR, scy - rSmall, 0.3, '#000000');
      addLine(coneR, scy - rSmall, coneR, scy + rSmall, 0.3, '#000000');
      addLine(coneR, scy + rSmall, coneL, scy + rBig, 0.3, '#000000');
      addLine(coneL, scy + rBig, coneL, scy - rBig, 0.3, '#000000');
      addLine(coneL - 1, scy, coneR + 2.5, scy, 0.2, '#64748b', [3, 1, 1, 1]);
    }
  }

  // 5. Views and CAD Geometry
  for (const v of views) {
    // Shaded polygons first (beneath line strokes)
    for (const poly of v.polygons) {
      addPolygon(poly.points, poly.color);
    }

    // Circles
    for (const c of v.circles) {
      addCircle(c.center.x, c.center.y, c.radius, 0.5, c.color || '#111827');
    }

    // Line segments
    for (const l of v.lines) {
      if (l.type === 'hidden' && !config.showHiddenLines) continue;
      const dash = l.type === 'hidden'
        ? [2.2, 1.2]
        : l.type === 'center'
        ? [5.0, 1.2, 1.2, 1.2]
        : [];
      const col = l.color || (l.type === 'center' ? '#64748b' : '#111827');
      addLine(l.start.x, l.start.y, l.end.x, l.end.y, l.strokeWidth || 0.5, col, dash);
    }

    // View Label placed neatly below geometry
    const labelX = v.labelPos ? v.labelPos.x : (v.box.x + v.box.width / 2);
    const labelY = v.labelPos ? v.labelPos.y : (v.box.y + v.box.height - 2);
    addText(v.title, labelX, labelY, 3.2, true, '#111827', 'center');
  }

  // ==========================================
  // COMPOSE BINARY/ASCII PDF 1.4 FILE
  // ==========================================
  const streamContent = ops.join('\n');
  const streamLength = streamContent.length;

  const objects: string[] = [
    // 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    // 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    // 3: Page
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj`,
    // 4: Stream
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`,
    // 5: Helvetica Font
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    // 6: Helvetica-Bold Font
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
  ];

  let pdfText = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdfText.length);
    pdfText += objects[i] + '\n';
  }

  const startXref = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += '0000000000 65535 f \n';
  for (let i = 0; i < offsets.length; i++) {
    pdfText += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdfText += `startxref\n${startXref}\n%%EOF`;

  return new Blob([pdfText], { type: 'application/pdf' });
}
