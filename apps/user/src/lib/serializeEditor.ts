import { toBold, toBoldItalic, toItalic, toStrikethrough, toUnderline } from './textStyle';

/**
 * Flattens a TipTap/ProseMirror document (from editor.getJSON()) down to the
 * plain text LinkedIn/Facebook/X's compose APIs actually accept — real HTML
 * formatting would be silently stripped, so bold/italic/etc. become Unicode
 * lookalike characters instead (see textStyle.ts), links become "text (url)",
 * and images are extracted separately via firstImageSrc/imageCount below.
 */

type PMMark = { type: string; attrs?: Record<string, unknown> };
type PMNode = { type: string; text?: string; marks?: PMMark[]; attrs?: Record<string, unknown>; content?: PMNode[] };

function styleText(text: string, marks: PMMark[] = []): string {
  const has = (t: string) => marks.some((m) => m.type === t);
  let out = text;
  if (has('bold') && has('italic')) out = toBoldItalic(out);
  else if (has('bold')) out = toBold(out);
  else if (has('italic')) out = toItalic(out);
  if (has('strike')) out = toStrikethrough(out);
  if (has('underline')) out = toUnderline(out);

  const link = marks.find((m) => m.type === 'link');
  const href = link?.attrs?.href as string | undefined;
  if (href) out = out.trim() === href.trim() ? href : `${out} (${href})`;

  return out;
}

function inlineText(nodes: PMNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return styleText(n.text || '', n.marks);
      if (n.type === 'hardBreak') return '\n';
      return '';
    })
    .join('');
}

function listItemLines(item: PMNode, prefix: string): string[] {
  const lines = (item.content ?? []).flatMap(blockToLines);
  if (lines.length === 0) return [];
  return [`${prefix}${lines[0]}`, ...lines.slice(1)];
}

function blockToLines(node: PMNode): string[] {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return [inlineText(node.content)];
    case 'blockquote':
      return (node.content ?? []).flatMap(blockToLines).map((l) => `❝ ${l}`);
    case 'bulletList':
      return (node.content ?? []).flatMap((li) => listItemLines(li, '• '));
    case 'orderedList': {
      let i = 0;
      return (node.content ?? []).flatMap((li) => listItemLines(li, `${++i}. `));
    }
    case 'image':
      return [];
    default:
      return node.content ? node.content.flatMap(blockToLines) : [];
  }
}

export function docToPlainText(doc: PMNode): string {
  const blocks = (doc.content ?? []).map((node) => blockToLines(node).join('\n'));
  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function firstImageSrc(doc: PMNode): string | undefined {
  let found: string | undefined;
  function walk(node: PMNode) {
    if (found) return;
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      found = node.attrs.src;
      return;
    }
    node.content?.forEach(walk);
  }
  walk(doc);
  return found;
}

export function countImages(doc: PMNode): number {
  let count = 0;
  function walk(node: PMNode) {
    if (node.type === 'image') count += 1;
    node.content?.forEach(walk);
  }
  walk(doc);
  return count;
}
