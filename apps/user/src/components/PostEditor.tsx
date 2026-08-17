import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImagePlus, Type, Upload, X as XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@syncpost/api-client';
import { Button, Input, Textarea, cn } from '@syncpost/ui';
import { api } from '../lib/api';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type PostBlock = { id: string; type: 'text'; text: string } | { id: string; type: 'image'; url: string };

export function blocksToContent(blocks: PostBlock[]): string {
  return blocks
    .filter((b): b is { id: string; type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function firstImageUrl(blocks: PostBlock[]): string | undefined {
  const block = blocks.find((b) => b.type === 'image' && b.url.trim());
  return block?.type === 'image' ? block.url : undefined;
}

export function imageCount(blocks: PostBlock[]): number {
  return blocks.filter((b) => b.type === 'image' && b.url.trim()).length;
}

interface PostEditorProps {
  blocks: PostBlock[];
  onChange: (blocks: PostBlock[]) => void;
}

export function PostEditor({ blocks, onChange }: PostEditorProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from === -1 || to === -1) return;
    onChange(arrayMove(blocks, from, to));
  }

  function updateBlock(id: string, patch: Partial<PostBlock>) {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as PostBlock) : b)));
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  function addBlock(type: PostBlock['type']) {
    const id = crypto.randomUUID();
    onChange([...blocks, type === 'text' ? { id, type, text: '' } : { id, type, url: '' }]);
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block) => (
              <SortableBlock key={block.id} block={block} onUpdate={updateBlock} onRemove={removeBlock} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Add a text or image section to start composing.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => addBlock('text')}>
          <Type /> Add text
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addBlock('image')}>
          <ImagePlus /> Add image
        </Button>
      </div>
    </div>
  );
}

function SortableBlock({
  block,
  onUpdate,
  onRemove,
}: {
  block: PostBlock;
  onUpdate: (id: string, patch: Partial<PostBlock>) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 rounded-md border bg-background p-2',
        isDragging && 'z-10 opacity-70 shadow-md',
      )}
    >
      <button
        type="button"
        className="mt-1.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1">
        {block.type === 'text' ? (
          <Textarea
            rows={3}
            placeholder="Write a section of your post..."
            value={block.text}
            onChange={(e) => onUpdate(block.id, { text: e.target.value })}
            className="border-0 p-0 shadow-none focus-visible:ring-0"
          />
        ) : (
          <ImageBlockEditor url={block.url} onChange={(url) => onUpdate(block.id, { url })} />
        )}
      </div>

      <button
        type="button"
        className="mt-1.5 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Remove section"
        onClick={() => onRemove(block.id)}
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ImageBlockEditor({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image is too large (max 8 MB).');
      return;
    }
    setUploading(true);
    try {
      const { url: uploadedUrl } = await api.upload<{ url: string }>('/uploads', file);
      onChange(uploadedUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="https://... image URL, or upload from your computer"
          value={url}
          onChange={(e) => onChange(e.target.value)}
        />
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload /> {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div
        className={cn(
          'rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground transition-colors',
          dragOver && 'border-primary bg-muted',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) uploadFile(file);
        }}
      >
        {url.trim() ? (
          <img
            src={url}
            alt=""
            className="mx-auto max-h-40 rounded-md border object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <span>Drag and drop an image here, or use Upload / paste a URL above.</span>
        )}
      </div>
    </div>
  );
}
