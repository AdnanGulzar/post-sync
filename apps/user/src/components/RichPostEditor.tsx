import { useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Smile,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { Button, Textarea, cn } from '@syncpost/ui';
import { toBold, toBoldItalic, toItalic, toStrikethrough, toUnderline } from '../lib/textStyle';
import { ImageBlockEditor } from './PostEditor';

const EMOJIS = [
  '😀', '😂', '😍', '😎', '🤔', '👍', '👏', '🙌', '🔥', '✨',
  '🎉', '🚀', '💡', '📈', '✅', '❤️', '💯', '🙏', '👀', '⭐',
];

interface RichPostEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  imageUrl: string;
  onImageChange: (url: string) => void;
}

export function RichPostEditor({ text, onTextChange, imageUrl, onImageChange }: RichPostEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<string[]>([text]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  function commit(next: string) {
    onTextChange(next);
    setHistory((h) => [...h.slice(0, historyIndex + 1), next]);
    setHistoryIndex((i) => i + 1);
  }

  function handleTyping(next: string) {
    onTextChange(next);
    // Debounce history entries while typing so undo works per pause, not per keystroke.
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setHistory((h) => [...h.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
    }, 600);
  }

  function undo() {
    if (historyIndex === 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    onTextChange(history[nextIndex]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    onTextChange(history[nextIndex]);
  }

  function transformSelection(transform: (s: string) => string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    if (selectionStart === selectionEnd) return;
    const selected = value.slice(selectionStart, selectionEnd);
    const transformed = transform(selected);
    const next = value.slice(0, selectionStart) + transformed + value.slice(selectionEnd);
    commit(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart, selectionStart + transformed.length);
    });
  }

  function transformLines(prefixFn: (line: string, index: number) => string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lineEndIdx = value.indexOf('\n', selectionEnd);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const block = value.slice(lineStart, lineEnd);
    const transformed = block.split('\n').map(prefixFn).join('\n');
    const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    commit(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, lineStart + transformed.length);
    });
  }

  function insertAtCursor(snippet: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const next = value.slice(0, selectionStart) + snippet + value.slice(selectionEnd);
    commit(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + snippet.length, selectionStart + snippet.length);
    });
  }

  function insertLink() {
    const url = window.prompt('Paste a URL to insert:');
    if (url && url.trim()) insertAtCursor(url.trim());
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted p-1">
        <ToolbarButton label="Bold" onClick={() => transformSelection(toBold)}>
          <Bold />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => transformSelection(toItalic)}>
          <Italic />
        </ToolbarButton>
        <ToolbarButton label="Bold + Italic" onClick={() => transformSelection(toBoldItalic)}>
          <span className="text-xs font-bold italic">BI</span>
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" onClick={() => transformSelection(toStrikethrough)}>
          <Strikethrough />
        </ToolbarButton>
        <ToolbarButton label="Underline" onClick={() => transformSelection(toUnderline)}>
          <UnderlineIcon />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          label="Bullet list"
          onClick={() => transformLines((line) => (line.startsWith('• ') ? line : `• ${line}`))}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() =>
            transformLines((line, i) => `${i + 1}. ${line.replace(/^\d+\.\s*/, '').replace(/^•\s*/, '')}`)
          }
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          onClick={() => transformLines((line) => (line.startsWith('❝ ') ? line : `❝ ${line}`))}
        >
          <Quote />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="Insert link" onClick={insertLink}>
          <LinkIcon />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton label="Emoji" onClick={() => setShowEmoji((s) => !s)}>
            <Smile />
          </ToolbarButton>
          {showEmoji && (
            <div className="absolute left-0 top-full z-10 mt-1 grid w-56 grid-cols-8 gap-1 rounded-md border bg-popover p-2 shadow-md">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded p-1 text-lg hover:bg-muted"
                  onClick={() => {
                    insertAtCursor(emoji);
                    setShowEmoji(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        <ToolbarButton label="Undo" onClick={undo} disabled={historyIndex === 0}>
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={redo} disabled={historyIndex >= history.length - 1}>
          <Redo2 />
        </ToolbarButton>
      </div>

      <Textarea
        ref={textareaRef}
        rows={8}
        placeholder="Write your post... select text and use the toolbar above to style it."
        value={text}
        onChange={(e) => handleTyping(e.target.value)}
      />

      <ImageBlockEditor url={imageUrl} onChange={onImageChange} />
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8')}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
