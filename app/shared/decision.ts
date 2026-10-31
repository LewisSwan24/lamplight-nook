import type { DecisionRequest } from './types';

/**
 * Esc is not an answer the user picked: "not now" on permissions, and on questions "you decide",
 * which the notebook doesn't keep as the user's choice.
 */
export function escapeChoice(req: Pick<DecisionRequest, 'options' | 'defaultId'>): string {
  const ids = req.options.map((o) => o.id);
  return ids.includes('deny') ? 'deny' : ids.includes('delegate') ? 'delegate' : req.defaultId;
}
