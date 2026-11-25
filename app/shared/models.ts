import type { CommissionForm } from './types';

/**
 * Which model the staff work on (plan-1.6.md F6). Three tiers, named for what they mean to the user rather than for the
 * model: the best work, a balance, or the least money. Each is Claude Code's alias for the newest model of its family,
 * so no model id here goes out of date. Pure data: both processes read it.
 */
export const MODEL_TIERS = ['best', 'balanced', 'saver'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** About what the shop ran on before there was a choice, at a middling price (Q-F7). */
export const DEFAULT_TIER: ModelTier = 'balanced';

export const TIER_MODEL: Record<ModelTier, 'opus' | 'sonnet' | 'haiku'> = { best: 'opus', balanced: 'sonnet', saver: 'haiku' };

export const cleanTier = (v: unknown): ModelTier | undefined => (MODEL_TIERS.includes(v as ModelTier) ? (v as ModelTier) : undefined);

/** The tier of a model as Claude Code names it (`claude-haiku-4-5-20251001`, or an alias); undefined for any other. */
export function tierOf(model: string | undefined): ModelTier | undefined {
  const m = model?.toLowerCase() ?? '';
  return MODEL_TIERS.find((t) => m.includes(TIER_MODEL[t]));
}

/** The model a commission runs on: its slip's tier when the user changed it there, else the one in settings. */
export const modelFor = (form: CommissionForm, setting: ModelTier): string => TIER_MODEL[cleanTier(form.model) ?? setting];

/** A talk with Adeng is only talk: it follows the setting, but never needs the best model. */
export const consultTier = (setting: ModelTier): ModelTier => (setting === 'best' ? 'balanced' : setting);

/** A slip that keeps the tier it would run on now: a schedule made today runs as it would have today. */
export const withModel = (form: CommissionForm, setting: ModelTier): CommissionForm => ({ ...form, model: cleanTier(form.model) ?? setting });
