import { Moon, Sun } from 'lucide-react';

import { Button, type ButtonProps } from './button';
import { useTheme } from './theme-provider';

export function ThemeToggle(props: Omit<ButtonProps, 'onClick' | 'children'>) {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme" {...props}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
