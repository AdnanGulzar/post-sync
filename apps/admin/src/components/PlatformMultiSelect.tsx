import { SocialPlatform } from '@syncpost/api-client';
import { Checkbox } from '@syncpost/ui';

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: 'LINKEDIN', label: 'LinkedIn' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'X', label: 'X' },
];

export function PlatformMultiSelect({
  value,
  onChange,
}: {
  value: SocialPlatform[];
  onChange: (v: SocialPlatform[]) => void;
}) {
  function toggle(platform: SocialPlatform) {
    onChange(value.includes(platform) ? value.filter((p) => p !== platform) : [...value, platform]);
  }

  return (
    <div className="flex flex-col gap-1">
      {PLATFORMS.map((p) => (
        <label key={p.key} className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={value.includes(p.key)} onCheckedChange={() => toggle(p.key)} />
          {p.label}
        </label>
      ))}
    </div>
  );
}
