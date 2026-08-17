/**
 * Plain-text "rich" formatting via Unicode lookalike characters — the same
 * technique LinkedIn/X bold-text generators use. Real HTML bold/italic would
 * be silently stripped when a post is sent to LinkedIn/Facebook/X (their
 * compose APIs only accept plain text), but these characters are just
 * different code points, so they render styled on any plain-text platform.
 */

function buildLetterMap(upperStart: number, lowerStart: number, hException?: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(65 + i)] = String.fromCodePoint(upperStart + i);
    map[String.fromCharCode(97 + i)] = String.fromCodePoint(lowerStart + i);
  }
  if (hException) map['h'] = hException;
  return map;
}

function buildDigitMap(start: number): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < 10; i++) map[String.fromCharCode(48 + i)] = String.fromCodePoint(start + i);
  return map;
}

const BOLD_MAP = { ...buildLetterMap(0x1d400, 0x1d41a), ...buildDigitMap(0x1d7ce) };
// U+1D455 (italic lowercase h) is unassigned in Unicode; U+210E is the designated substitute.
const ITALIC_MAP = buildLetterMap(0x1d434, 0x1d44e, 'ℎ');
const BOLD_ITALIC_MAP = { ...buildLetterMap(0x1d468, 0x1d482), ...buildDigitMap(0x1d7ce) };

function mapChars(text: string, map: Record<string, string>): string {
  return [...text].map((ch) => map[ch] ?? ch).join('');
}

export function toBold(text: string): string {
  return mapChars(text, BOLD_MAP);
}

export function toItalic(text: string): string {
  return mapChars(text, ITALIC_MAP);
}

export function toBoldItalic(text: string): string {
  return mapChars(text, BOLD_ITALIC_MAP);
}

export function toStrikethrough(text: string): string {
  return [...text].map((ch) => ch + '̶').join('');
}

export function toUnderline(text: string): string {
  return [...text].map((ch) => ch + '̲').join('');
}
