import type { CommissionForm, CommissionTemplate } from './types';
import type { ModelTier } from './models';
import { TEMPLATES, type TemplateId, type TemplateLayout } from './templates';

/**
 * Handing in without typing (plan-1.8.md H8, road-to-2.0.md section 6): materials dragged onto the card, a kind picked
 * from the sample shelf, Adeng's questions answered with a click, and the slip he writes up signed. The slip stays,
 * for those who would rather type (Q-F11); both make their commission here, so the two come out the same.
 */

/** The kinds on the sample shelf: all but those that start from a file or folder picked on this computer. */
export const HANDIN_KINDS: readonly TemplateId[] = TEMPLATES.filter((t) => !('source' in t)).map((t) => t.id);
/** Who it is for, as Adeng offers it; each has its words in `ui.handin.audience`. */
export const AUDIENCES = ['me', 'family', 'kids', 'friends', 'work'] as const;
export type Audience = (typeof AUDIENCES)[number];
/** What else to mind, as Adeng offers it; each has its words in `ui.handin.asks`. `none` adds nothing. */
export const ASKS = ['simple', 'print', 'phone', 'none'] as const;
export type Ask = (typeof ASKS)[number];

/** What the slip holds as it is handed in: the boxes as typed, and what was picked or handed over with them. */
export type SlipFields = {
  want: string; details?: string; audience?: string;
  /** The sticker picked, the demo among them. */
  template?: CommissionTemplate | 'demo';
  layout?: TemplateLayout; source?: string; materials: string[]; inPlace?: string; consult?: string; connections?: string[];
  model?: ModelTier;
  /** The demo's exact wording: it only runs on that. */
  demoFill: string;
};

/** The commission a slip makes. Empty boxes and lists say nothing; a lent folder or the demo takes no files handed over. */
export function slipForm(f: SlipFields): CommissionForm {
  const want = f.want.trim();
  const template = f.template && f.template !== 'demo' ? f.template : undefined;
  return {
    want,
    details: f.details?.trim() || undefined,
    audience: f.audience?.trim() || undefined,
    demo: f.template === 'demo' && want === f.demoFill,
    template,
    layout: template ? f.layout : undefined,
    source: f.source,
    materials: f.template === 'demo' || f.inPlace ? undefined : f.materials,
    inPlace: f.inPlace,
    consult: f.consult,
    connections: f.connections?.length ? f.connections : undefined,
    model: f.model,
  };
}

/** What was clicked on the hand-in card: the want is one of the ready answers, or what was typed when none fitted. */
export type HandInPicks = {
  template: TemplateId; layout?: TemplateLayout; want: string; audience?: Audience; ask?: Ask; materials: string[];
};
/** The words the picks stand for (`ui.handin`). */
export type HandInWords = { audience: Record<Audience, string>; asks: Record<Ask, string> };

/** The commission the signed slip makes: the one the slip would, had the same been typed into it. */
export function handInForm(p: HandInPicks, words: HandInWords): CommissionForm {
  return slipForm({
    want: p.want,
    template: p.template,
    layout: p.layout,
    audience: p.audience ? words.audience[p.audience] : undefined,
    details: p.ask && p.ask !== 'none' ? words.asks[p.ask] : undefined,
    materials: p.materials,
    demoFill: '',
  });
}
