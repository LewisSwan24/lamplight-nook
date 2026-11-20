import { ALL_STAFF } from '../../shared/staff';
import type { ActorId, Bubble } from '../../shared/types';

/** Portrait expressions, in the order they sit on assets/ui/portraits.png (scripts/art/portraits.py). */
export type Expression = 'calm' | 'happy' | 'troubled' | 'unsure' | 'serious';
export const EXPRESSIONS: Expression[] = ['calm', 'happy', 'troubled', 'unsure', 'serious'];
/** Staff in the order of the rows on the same sheet; the cat has no portrait (she doesn't talk). */
export const PORTRAIT_STAFF: ActorId[] = ALL_STAFF;

/** The mood bubble pinned to a portrait, so the expression reads at a glance even at 16 pixels a face. */
export const EXPRESSION_BADGE: Partial<Record<Expression, Bubble>> = { happy: 'note', troubled: 'sweat', unsure: 'dots' };

/** Which face a character wears in a given state (states from the character state machine). */
export function expressionFor(state: string): Expression {
  switch (state) {
    case 'stuck':
    case 'low':
      return 'troubled';
    case 'asking':
    case 'thinking':
      return 'unsure';
    case 'serious':
    case 'checking':
      return 'serious';
    case 'returning':
    case 'wrapping':
    case 'reacting':
    case 'comfort':
      return 'happy';
    default:
      return 'calm';
  }
}
