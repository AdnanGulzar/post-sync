import { Checkbox, Input } from '@syncpost/ui';

// Editor for a nullable numeric limit — null means "unlimited".
export function LimitInput({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  const unlimited = value === null;
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Input
        type="number"
        min={0}
        disabled={unlimited}
        value={unlimited ? '' : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="h-8 w-20 text-xs"
      />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <Checkbox checked={unlimited} onCheckedChange={() => onChange(unlimited ? 0 : null)} />
        Unlimited
      </label>
    </div>
  );
}
