import { SocialPlatform } from '@syncpost/api-client';
import { ALL_PLATFORMS as PLATFORMS } from '@syncpost/platform-core';
import { Checkbox } from '@syncpost/ui';


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
        <label key={p.id} className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={value.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
          {p.label}
        </label>
      ))}
    </div>
  );
}
