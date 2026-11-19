import { AlignmentType, Document, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { fit, picture } from './picture';
import type { DocSpec } from './specs';

/** The text width of the docx library's default page (A4 with one-inch margins), in pixels at 96 to the inch. */
const PAGE_WIDTH_PX = 600;
const PAGE_HEIGHT_PX = 860;
const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;

/**
 * Writes a Word document from a DocSpec (road-to-1.3.md C1). Pictures come only through `images`, which the tool layer
 * points at the commission folder; nothing here reads a path or reaches the network.
 */
export async function makeDocx(spec: DocSpec, images: (rel: string) => Buffer): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  if (spec.title) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(spec.title)] }));
  let lists = 0;
  for (const b of spec.blocks) {
    if ('h' in b) children.push(new Paragraph({ heading: HEADINGS[b.h], children: [new TextRun(b.text)] }));
    else if ('p' in b) children.push(new Paragraph({ children: runs(b.p) }));
    else if ('list' in b) {
      // Each numbered list starts again at 1, so it takes its own instance of the numbering.
      const instance = ++lists;
      for (const item of b.list) {
        children.push(new Paragraph(b.ordered
          ? { children: runs(item), numbering: { reference: 'numbered', level: 0, instance } }
          : { children: runs(item), bullet: { level: 0 } }));
      }
    } else if ('table' in b) {
      const { head, rows } = b.table;
      const width = Math.max(head.length, ...rows.map((r) => r.length));
      const row = (cells: string[], header: boolean) => new TableRow({
        tableHeader: header,
        children: Array.from({ length: width }, (_, i) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cells[i] ?? '', bold: header })] })] })),
      });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(head, true), ...rows.map((r) => row(r, false))] }));
    } else if ('image' in b) {
      const data = images(b.image);
      const p = picture(data);
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: p.type, data, transformation: fit(p, PAGE_WIDTH_PX, PAGE_HEIGHT_PX), altText: { name: b.caption ?? b.image, description: b.caption ?? '' } })],
      }));
      if (b.caption) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.caption, italics: true })] }));
    } else children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  const doc = new Document({
    title: spec.title,
    numbering: {
      config: [{
        reference: 'numbered',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

/** A paragraph's text with **bold** and *italic* made so; any other mark stays as typed. */
function runs(text: string): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const m of text.matchAll(/\*\*(.+?)\*\*|\*(.+?)\*/g)) {
    if (m.index > at) out.push(new TextRun(text.slice(at, m.index)));
    out.push(new TextRun(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], italics: true }));
    at = m.index + m[0].length;
  }
  if (at < text.length || !out.length) out.push(new TextRun(text.slice(at)));
  return out;
}
