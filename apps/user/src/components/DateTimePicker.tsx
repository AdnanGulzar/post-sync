import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button, Calendar, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@syncpost/ui';

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
}

const DEFAULT_HOUR = 9;

export function DateTimePicker({ value, onChange, minDate }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const timeValue = value ? format(value, 'HH:mm') : '';

  function handleDaySelect(day: Date | undefined) {
    if (!day) {
      onChange(undefined);
      return;
    }
    const next = new Date(day);
    if (value) next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    else next.setHours(DEFAULT_HOUR, 0, 0, 0);
    onChange(next);
    setOpen(false);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const [hours, minutes] = e.target.value.split(':').map(Number);
    const base = value ? new Date(value) : new Date();
    base.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(base);
  }

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn('w-40 justify-start text-left font-normal', !value && 'text-muted-foreground')}
          >
            <CalendarIcon className="h-4 w-4" />
            {value ? format(value, 'PP') : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDaySelect}
            disabled={minDate ? { before: minDate } : undefined}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        value={timeValue}
        onChange={handleTimeChange}
        disabled={!value}
        className="w-28"
      />
    </div>
  );
}
