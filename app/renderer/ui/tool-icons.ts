/** The toolbar's pixel icons, in the order of the strip scripts/art/tools.py draws (assets/sprites/tools.png). */
export const TOOL_ICONS = ['order', 'progress', 'projects', 'works', 'notebook', 'captions', 'sound', 'mute', 'gear'] as const;
export type ToolIcon = (typeof TOOL_ICONS)[number];
