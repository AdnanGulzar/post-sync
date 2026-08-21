import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Smile,
  Undo2,
  Redo2,
} from 'lucide-react';
import { Button, cn } from '@syncpost/ui';
import { ApiError } from '@syncpost/api-client';
import { api } from '../lib/api';
import { PMNode, countImages, docToPlainText, firstImageSrc } from '../lib/serializeEditor';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EMOJIS = [
  '😀', '😂', '😍', '😎', '🤔', '👍', '👏', '🙌', '🔥', '✨',
  '🎉', '🚀', '💡', '📈', '✅', '❤️', '💯', '🙏', '👀', '⭐',
];

export interface RichTextEditorHandle {
  clear: () => void;
}

interface RichTextEditorProps {
  onChange: (content: string, imageUrl: string | undefined, imageCount: number) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { onChange },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
      Image,
    ],
    editorProps: {
      attributes: { class: 'prose-editor min-h-40 focus:outline-none' },
    },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON() as PMNode;
      onChange(docToPlainText(doc), firstImageSrc(doc), countImages(doc));
    },
  });

  useImperativeHandle(ref, () => ({
    clear: () => editor?.commands.clearContent(true),
  }));

  // Fires once on mount so an empty editor still reports empty content/no image,
  // matching what onUpdate would report — the initial doc never triggers onUpdate itself.
  useEffect(() => {
    if (!editor) return;
    const doc = editor.getJSON() as PMNode;
    onChange(docToPlainText(doc), firstImageSrc(doc), countImages(doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  async function uploadFile(file: File) {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError('Image is too large (max 8 MB).');
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.upload<{ url: string }>('/uploads', file);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  function insertLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Paste a URL to insert:', previousUrl || '');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  if (!editor) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted p-1">
        <ToolbarButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          label="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="Insert link" active={editor.isActive('link')} onClick={insertLink}>
          <LinkIcon />
        </ToolbarButton>
        <ToolbarButton label="Insert image" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <ImageIcon />
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = '';
          }}
        />
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
                    editor.chain().focus().insertContent(emoji).run();
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

        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 />
        </ToolbarButton>
      </div>

      <div className="rounded-md border bg-background px-3 py-2 text-sm">
        <EditorContent editor={editor} />
      </div>

      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {uploading && <p className="text-xs text-muted-foreground">Uploading image...</p>}
    </div>
  );
});

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', active && 'bg-accent text-accent-foreground')}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
