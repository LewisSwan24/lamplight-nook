import type { RoomId, SceneId } from './scenes';

/**
 * Where each kind of work is done (road-to-1.4.md D3): the home shop, wherever it is, or one of the shops along the street,
 * the bakery since plan-1.6.md F1. Pure data: both processes read it.
 */
export const SHOPS = ['home', 'print', 'studio', 'workshop', 'bakery'] as const;
export type Shop = (typeof SHOPS)[number];
/** The shops along the street, which work for each other. */
export type StreetShop = Exclude<Shop, 'home'>;

/** The room a round plays in: its shop, or the home shop's room for the home kinds and for work of no kind. */
export const roomFor = (shop: Shop | undefined, home: SceneId): RoomId => (!shop || shop === 'home' ? home : shop);

const office = (tool: string) => `mcp__nook-office__${tool}`;
/**
 * Tools that belong to one of the street shops: used by another of them, that shop's person does it and brings it back.
 * The home shop keeps its own table and filing cabinet for these (road-to-1.3.md C8), so it sends nobody.
 */
export const TOOL_SHOP: Readonly<Record<string, StreetShop>> = {
  [office('render_png')]: 'studio',
  [office('make_pdf')]: 'print',
  [office('make_docx')]: 'print',
  [office('make_pptx')]: 'print',
  [office('make_xlsx')]: 'print',
};

const STREET: readonly RoomId[] = ['print', 'studio', 'workshop', 'bakery'];
/** The shop a tool used in this room is run at, when that is another of the street shops. */
export function errandTo(room: RoomId, tool: string | undefined): StreetShop | undefined {
  const shop = tool ? TOOL_SHOP[tool] : undefined;
  return shop && shop !== room && STREET.includes(room) ? shop : undefined;
}
