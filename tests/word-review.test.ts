import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SUBAGENTS } from '../app/main/agent-runner';
import { makeDocx } from '../app/main/office/docx';
import { docSpecShape } from '../app/main/office/specs';
import { readZip } from '../app/main/office/unzip';
import { nookName } from '../app/main/nook-tools';

// Word documents in 1.7's real runs (plan-1.8.md H0): Flint could not read them, and the designer's colours had
// nowhere to go.

const styles = async (spec: Parameters<typeof makeDocx>[0]) => readZip(await makeDocx(spec, () => Buffer.alloc(0))).get('word/styles.xml')!().toString();

describe('Flint reads Office files', () => {
  it('has the office reader, and still nothing that writes', () => {
    const tools = SUBAGENTS.reviewer.tools ?? [];
    expect(tools).toContain(nookName('office', 'read_document'));
    for (const t of tools) expect(t, t).not.toMatch(/Write|Edit|make_|edit_|Bash/);
  });

  it('is told to use it for Word, Excel and PowerPoint files', () => {
    expect(SUBAGENTS.reviewer.prompt).toMatch(/read_document/);
    expect(SUBAGENTS.reviewer.prompt).toMatch(/\.docx/);
  });

  it('lets the designer reach it too, to look at a document that is already there', () => {
    expect(SUBAGENTS.designer.tools).toContain(nookName('office', 'read_document'));
    // And proposes for a Word document only what make_docx can carry out.
    expect(SUBAGENTS.designer.prompt).toMatch(/Word document only two things carry over/);
  });
});

describe('a Word document in the designer\'s colours', () => {
  it('colours the title, the headings and the table headers with the accent, and sets the body size', async () => {
    const xml = await styles({ title: 'Menu', accent: '#8B1E3F', size: 12, blocks: [{ h: 1, text: 'Starters' }, { p: 'Soup' }] });
    expect(xml).toMatch(/w:styleId="Title"[\s\S]*?w:color w:val="8B1E3F"/);
    expect(xml).toMatch(/w:styleId="Heading1"[\s\S]*?w:color w:val="8B1E3F"/);
    // Word counts type in half points.
    expect(xml).toMatch(/<w:sz w:val="24"\/>/);
  });

  it('leaves the plain look as it was without them', async () => {
    const xml = await styles({ title: 'Menu', blocks: [{ p: 'Soup' }] });
    expect(xml).not.toMatch(/8B1E3F/);
  });

  it('takes the accent with or without the #, and a size from 9 to 16 points only', () => {
    const spec = z.object(docSpecShape);
    const base = { file: 'a.docx', blocks: [{ p: 'x' }] };
    expect(spec.safeParse({ ...base, accent: '8B1E3F', size: 11 }).success).toBe(true);
    expect(spec.safeParse({ ...base, accent: 'red' }).success).toBe(false);
    expect(spec.safeParse({ ...base, size: 40 }).success).toBe(false);
  });
});
