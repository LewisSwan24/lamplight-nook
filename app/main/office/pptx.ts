import PptxGenJS from 'pptxgenjs';
import { fit, picture } from './picture';
import type { SlideSpec } from './specs';

// A 16:9 slide is 10 x 5.625 inches. The content box sits under the title, with a half-inch margin all round.
const W = 10;
const MARGIN = 0.5;
const BODY = { x: MARGIN, y: 1.35, w: W - 2 * MARGIN, h: 3.8 };
const INK = '1F2937';
const ACCENT = '2F6FDE';

/**
 * Writes a PowerPoint deck from a SlideSpec (road-to-1.3.md C1). Titles go in a real title placeholder, so PowerPoint's
 * outline and the reader both know them. Pictures are handed to pptxgenjs as base64 data read through `images`, never as
 * a path or an address, so the library never opens a file or the network.
 */
export async function makePptx(spec: SlideSpec, images: (rel: string) => Buffer): Promise<Buffer> {
  const accent = (spec.accent ?? ACCENT).replace(/^#/, '').toUpperCase();
  const titleColor = spec.accent ? accent : INK;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = spec.title;
  const placeholder = (x: number, y: number, w: number, h: number, size: number, align: 'left' | 'center') =>
    ({ placeholder: { options: { name: 'title', type: 'title' as const, x, y, w, h, fontSize: size, bold: true, color: titleColor, align, valign: 'middle' as const }, text: '' } });
  pptx.defineSlideMaster({
    title: 'NOOK_TITLE',
    objects: [{ rect: { x: 3.5, y: 3.35, w: 3, h: 0.06, fill: { color: accent } } }, placeholder(MARGIN, 1.6, W - 2 * MARGIN, 1.5, 40, 'center')],
  });
  pptx.defineSlideMaster({
    title: 'NOOK',
    objects: [{ rect: { x: MARGIN - 0.2, y: 0.4, w: 0.08, h: 0.7, fill: { color: accent } } }, placeholder(MARGIN, 0.3, W - 2 * MARGIN, 0.9, 28, 'left')],
  });

  for (const s of spec.slides) {
    const slide = pptx.addSlide({ masterName: s.layout === 'title' ? 'NOOK_TITLE' : 'NOOK' });
    slide.addText(s.title, { placeholder: 'title' });
    if (s.layout === 'title') {
      if (s.bullets?.length) slide.addText(s.bullets.join('\n'), { x: MARGIN, y: 3.55, w: W - 2 * MARGIN, h: 1, fontSize: 20, color: '4B5563', align: 'center' });
    } else if (s.layout === 'image') {
      if (s.image) {
        const data = images(s.image);
        const p = picture(data);
        // Fitted in inches at 96 pixels to the inch, then centred in the content box.
        const size = fit({ width: p.width / 96, height: p.height / 96 }, BODY.w, BODY.h, true);
        slide.addImage({ data: `${p.mime};base64,${data.toString('base64')}`, x: BODY.x + (BODY.w - size.width) / 2, y: BODY.y + (BODY.h - size.height) / 2, w: size.width, h: size.height });
      }
    } else if (s.layout === 'two') {
      const half = (BODY.w - 0.4) / 2;
      bullets(slide, s.bullets, { ...BODY, w: half });
      bullets(slide, s.right, { ...BODY, x: BODY.x + half + 0.4, w: half });
    } else bullets(slide, s.bullets, BODY);
    if (s.notes) slide.addNotes(s.notes);
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}

function bullets(slide: PptxGenJS.Slide, items: string[] | undefined, box: { x: number; y: number; w: number; h: number }) {
  if (!items?.length) return;
  slide.addText(items.map((text) => ({ text, options: { bullet: true, breakLine: true } })), { ...box, fontSize: 20, color: INK, valign: 'top', paraSpaceAfter: 6 });
}
