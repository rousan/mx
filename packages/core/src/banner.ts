/**
 * A tiny zero-dependency block-letter renderer, used by `mx divider` to fill a
 * terminal with large text as a visual separator between Mission Control Spaces.
 *
 * Each glyph is a 5-wide by 7-tall bitmap (`#` = filled, space = empty). The
 * renderer composes the text, scales it up to roughly fill the given terminal
 * size (correcting for the ~2:1 height-to-width of a character cell), and
 * centers it. Rendering is pure — it takes the terminal dimensions as arguments
 * and returns a string — so the CLI layer owns all the terminal I/O (clearing,
 * cursor, holding the banner on screen).
 */

/**
 * Height (rows) of every glyph in {@link FONT}.
 */
const GLYPH_H = 7;

/**
 * 5x7 block-font glyphs keyed by uppercase character. `#` marks a filled cell,
 * a space an empty one; every row is exactly 5 characters wide. Unknown
 * characters fall back to space (or `?` when the character isn't whitespace).
 */
const FONT: Record<string, string[]> = {
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ####', '#    ', '#    ', '#  ##', '#   #', '#   #', ' ####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  J: ['#####', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '#   #', '# # #', '## ##', '#   #'],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '   # ', '  #  ', ' #   ', '#    ', '#    ', '#####'],
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'],
  '2': [' ### ', '#   #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  '3': ['#####', '   # ', '  #  ', ' ### ', '   # ', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '   # ', '   # ', '  #  ', '  #  ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  '&': [' ##  ', '#  # ', '#  # ', ' ##  ', '#  ##', '#  # ', ' ## #'],
  '/': ['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '],
  '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
  ':': ['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     '],
  '!': ['  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '     ', '  #  '],
  '?': [' ### ', '#   #', '   # ', '  #  ', '  #  ', '     ', '  #  '],
};

/**
 * Resolve the glyph for a character, falling back to a blank for spaces/unknown
 * whitespace and to `?` for any other unsupported character.
 *
 * @param ch - A single (already uppercased) character.
 * @returns The 7-row glyph bitmap.
 */
function glyphFor(ch: string): string[] {
  if (FONT[ch]) return FONT[ch];
  return ch.trim() === '' ? FONT[' '] : FONT['?'];
}

/**
 * Render `text` as large block letters centered in a `cols` by `rows` terminal,
 * scaled up to roughly fill the space. Returns exactly `rows` newline-separated
 * lines (blank where empty) using `█` for filled cells, so the caller can clear
 * the screen and print it as a full-screen banner.
 *
 * @param text - The label to render (case-insensitive; unsupported chars become `?`).
 * @param cols - Terminal width in columns.
 * @param rows - Terminal height in rows.
 * @returns The composed banner as a single string of `rows` lines.
 */
export function renderBanner(text: string, cols: number, rows: number): string {
  const chars = [...text.toUpperCase()];
  const glyphs = chars.map(glyphFor);
  // Base bitmap width: each glyph is 5 cells wide, joined by a 1-cell gap.
  const baseW = glyphs.length === 0 ? 0 : glyphs.length * 5 + (glyphs.length - 1);

  // Compose the 7 base rows (glyphs separated by a blank column).
  const baseRows: string[] = [];
  for (let r = 0; r < GLYPH_H; r++) {
    baseRows.push(glyphs.map((g) => g[r]).join(' '));
  }

  // Scale up to fill the terminal. Width is the usual constraint (a long label
  // caps how wide each cell can be), so take the largest cell width that fits
  // and then grow the height to match — capped at the same factor so letters
  // stay chunky (roughly square in cell counts) rather than proportional-but-
  // tiny. This fills far more of a large fullscreen window than strict
  // proportional scaling, which is what makes the banner readable at a glance.
  const marginH = 2;
  const marginV = 2;
  const xMax = Math.floor((cols - marginH) / Math.max(1, baseW));
  const yMax = Math.floor((rows - marginV) / GLYPH_H);
  const xscale = Math.max(1, xMax);
  const yscale = Math.max(1, Math.min(yMax, xscale));

  // Scale each base row up (horizontally by xscale, vertically by yscale).
  const scaled: string[] = [];
  for (const row of baseRows) {
    let line = '';
    for (const cell of row) line += (cell === '#' ? '█' : ' ').repeat(xscale);
    for (let k = 0; k < yscale; k++) scaled.push(line);
  }
  const lineW = baseW * xscale;

  // Center vertically and horizontally, padding out to exactly `rows` lines.
  const out: string[] = [];
  const padTop = Math.max(0, Math.floor((rows - scaled.length) / 2));
  const padLeft = ' '.repeat(Math.max(0, Math.floor((cols - lineW) / 2)));
  for (let i = 0; i < padTop; i++) out.push('');
  for (const l of scaled) out.push(l.trim() === '' ? '' : padLeft + l);
  while (out.length < rows) out.push('');
  return out.join('\n');
}
