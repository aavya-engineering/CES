const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  PageBreak, TableOfContents, LevelFormat, BorderStyle, ShadingType, Header, Footer, PageNumber,
} = require('docx');

const NAVY = '1E2761', INK = '1F2937', MUTED = '5B6470', LINE = 'D0D7E2';
const FONT = 'Calibri', HFONT = 'Cambria';

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...(opts.para || {}), children: [new TextRun({ font: FONT, size: 22, color: INK, text, ...(opts.run || {}) })] });
const runs = (parts, para = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...para, children: parts.map((x) => typeof x === 'string' ? new TextRun({ font: FONT, size: 22, color: INK, text: x }) : new TextRun({ font: FONT, size: 22, color: INK, ...x })) });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t })] });
const bullet = (t, keepNext = false) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, keepNext, spacing: { after: 60, line: 276 }, children: typeof t === 'string' ? [new TextRun({ font: FONT, size: 22, color: INK, text: t })] : t.map((x) => new TextRun({ font: FONT, size: 22, color: INK, ...(typeof x === 'string' ? { text: x } : x) })) });
const num = (t) => new Paragraph({ numbering: { reference: 'num', level: 0 }, spacing: { after: 60, line: 276 }, children: typeof t === 'string' ? [new TextRun({ font: FONT, size: 22, color: INK, text: t })] : t.map((x) => new TextRun({ font: FONT, size: 22, color: INK, ...(typeof x === 'string' ? { text: x } : x) })) });
let numInstance = 0;
/** A fresh numbered list (restarts at 1). items: string | run-array */
const nums = (items) => { numInstance += 1; return items.map((t) => new Paragraph({ numbering: { reference: 'num', level: 0, instance: numInstance }, spacing: { after: 60, line: 276 }, children: typeof t === 'string' ? [new TextRun({ font: FONT, size: 22, color: INK, text: t })] : t.map((x) => new TextRun({ font: FONT, size: 22, color: INK, ...(typeof x === 'string' ? { text: x } : x) })) })); };
const muted = (t) => p(t, { run: { color: MUTED, size: 20, italics: true } });
const note = (t) => new Paragraph({ spacing: { after: 140 }, shading: { type: ShadingType.CLEAR, fill: 'FFF8E1', color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C8A24A', space: 6 } }, children: [new TextRun({ font: FONT, size: 21, color: INK, text: t })] });
const code = (lines) => (Array.isArray(lines) ? lines : [lines]).map((t, i, a) => new Paragraph({ spacing: { after: i === a.length - 1 ? 140 : 0, line: 240 }, shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' }, keepNext: i < a.length - 1, children: [new TextRun({ font: 'Courier New', size: 18, color: INK, text: t || ' ' })] }));
const br = () => new Paragraph({ children: [new PageBreak()] });

function img(file, widthIn, size) {
  const [w, h] = size; const W = Math.round(widthIn * 96); const H = Math.round(h * W / w);
  return new Paragraph({ spacing: { before: 60, after: 160 }, alignment: AlignmentType.CENTER, children: [new ImageRun({ type: file.endsWith('.png') ? 'png' : 'jpg', data: fs.readFileSync(file), transformation: { width: W, height: H }, altText: { title: path.basename(file), description: path.basename(file), name: path.basename(file) } })] });
}

function table(headers, rows, widths, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, head, w) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ font: opts.mono && !head ? 'Courier New' : FONT, size: 19, bold: head, color: head ? 'FFFFFF' : INK, text: t })] })] });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.SINGLE, size: 4, color: LINE }, right: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, true, widths[i])) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths[i])) }))] });
}

function cover(title, subtitle, meta) {
  return [
    new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ font: HFONT, size: 56, bold: true, color: NAVY, text: title })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ font: HFONT, size: 32, color: INK, text: subtitle })] }),
    new Paragraph({ spacing: { after: 1200 }, children: [new TextRun({ font: FONT, size: 22, color: MUTED, text: meta })] }),
  ];
}

function toc() {
  return [h1('Contents'), new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }), muted('If the table is empty, right-click it and choose Update Field (Word builds it on open).'), br()];
}

function build(children, { title, description, headerText }) {
  return new Document({
    creator: 'Aavya Engineering', title, description,
    styles: {
      default: { document: { run: { font: FONT, size: 22, color: INK } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 36, bold: true, color: NAVY }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 28, bold: true, color: NAVY }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [
      { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ] },
    features: { updateFields: true },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ font: FONT, size: 18, color: MUTED, text: headerText })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ font: FONT, size: 18, color: MUTED, children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })] })] }) },
      children,
    }],
  });
}

async function write(doc, file) { const buf = await Packer.toBuffer(doc); fs.writeFileSync(file, buf); console.log('written', file, buf.length); }

module.exports = { p, runs, h1, h2, h3, bullet, num, nums, muted, note, code, br, img, table, cover, toc, build, write, NAVY, INK, MUTED };
