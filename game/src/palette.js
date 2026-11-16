// The look plan, in one place. Six base values, one accent hue per team, one danger
// hue; the lighting makes every shade the game needs, so no other colour appears in
// the code. The same names are the CSS custom properties in index.html.
// AMBER is the player's team, TEAL the enemy team; ACCENT is AMBER's hue.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  teal: '#2ec4b6',
  danger: '#e5484d',
};

export const TEAM = {
  amber: { name: 'AMBER', color: PALETTE.accent, css: '#f0a830' },
  teal: { name: 'TEAL', color: PALETTE.teal, css: '#2ec4b6' },
};

export function shade(name) {
  return PALETTE[name];
}
