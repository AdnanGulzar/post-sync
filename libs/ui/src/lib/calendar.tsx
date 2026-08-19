import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from './utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, style, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('p-2', className)}
      style={
        {
          '--rdp-accent-color': 'var(--primary)',
          '--rdp-accent-background-color': 'var(--accent)',
          '--rdp-today-color': 'var(--primary)',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Calendar };
