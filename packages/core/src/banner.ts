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
 * The unscaled bitmap of one text line: its `GLYPH_H` rows and total cell width.
 */
interface LineBitmap {
  /** `GLYPH_H` strings of `#`/space — the line's glyphs joined by a blank column. */
  rows: string[];
  /** Width of each row in base cells. */
  width: number;
}

/**
 * Build the unscaled bitmap for a single line, **rendered literally** — every
 * character (including spaces) becomes a glyph, so the caller's spacing is
 * preserved exactly.
 *
 * @param line - One (already uppercased) line of text.
 * @returns Its base rows and width.
 */
function lineBitmap(line: string): LineBitmap {
  const glyphs = [...line].map(glyphFor);
  const rows: string[] = [];
  for (let r = 0; r < GLYPH_H; r++) rows.push(glyphs.map((g) => g[r]).join(' '));
  return { rows, width: glyphs.length === 0 ? 0 : glyphs.length * 5 + (glyphs.length - 1) };
}

/**
 * Render `text` as large block letters centered in a `cols` by `rows` terminal,
 * scaled up to fill the space. The text is rendered **literally**: spaces are
 * preserved as-is (so `  MAIN  ` keeps its padding), and **you** control line
 * breaks — a newline, either a real one or the two-character sequence `\n`,
 * starts a new stacked line. Nothing is auto-wrapped or collapsed. Returns
 * exactly `rows` newline-separated lines using `█` for filled cells.
 *
 * @param text - The label to render (case-insensitive; unsupported chars become `?`; `\n` or a real newline stacks lines; spaces are kept verbatim).
 * @param cols - Terminal width in columns.
 * @param rows - Terminal height in rows.
 * @returns The composed banner as a single string of `rows` lines.
 */
export function renderBanner(text: string, cols: number, rows: number): string {
  // Treat the literal two-character sequence "\n" as a line break too, since a
  // real newline is awkward to pass on a command line.
  const lines = text.replace(/\\n/g, '\n').toUpperCase().split('\n');
  const blank = (): string => Array.from({ length: rows }, () => '').join('\n');
  if (lines.every((l) => l === '')) return blank();

  const bitmaps = lines.map(lineBitmap);
  const maxW = Math.max(1, ...bitmaps.map((b) => b.width));
  const gap = 1; // blank base-rows between stacked lines
  const totalBaseH = lines.length * GLYPH_H + (lines.length - 1) * gap;

  // Scale up to fill the terminal, based on the widest line and the stacked
  // height. Take the largest cell width the width allows, then grow the height
  // to match (capped at the same factor so letters stay chunky, not needle
  // thin). Since the caller controls wrapping, short lines fill the window.
  const marginH = 2;
  const marginV = 2;
  const xMax = Math.floor((cols - marginH) / maxW);
  const yMax = Math.floor((rows - marginV) / Math.max(1, totalBaseH));
  const xscale = Math.max(1, xMax);
  const yscale = Math.max(1, Math.min(yMax, xscale));

  const lineW = maxW * xscale;
  const padLeft = ' '.repeat(Math.max(0, Math.floor((cols - lineW) / 2)));

  // Compose the scaled block, each line centered within the widest line's box.
  const block: string[] = [];
  bitmaps.forEach((bm, i) => {
    const leadCells = Math.floor((maxW - bm.width) / 2);
    for (const row of bm.rows) {
      const padded = ' '.repeat(leadCells) + row + ' '.repeat(maxW - bm.width - leadCells);
      let line = '';
      for (const cell of padded) line += (cell === '#' ? '█' : ' ').repeat(xscale);
      for (let k = 0; k < yscale; k++) block.push(line.trimEnd() === '' ? '' : padLeft + line);
    }
    if (i < lines.length - 1) for (let g = 0; g < gap * yscale; g++) block.push('');
  });

  // Center vertically, then pad/clip to exactly `rows` lines.
  const out: string[] = [];
  const padTop = Math.max(0, Math.floor((rows - block.length) / 2));
  for (let i = 0; i < padTop; i++) out.push('');
  out.push(...block);
  while (out.length < rows) out.push('');
  return out.slice(0, rows).join('\n');
}
