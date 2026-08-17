import { Toaster as Sonner, ToasterProps } from 'sonner';
import { useTheme } from './theme-provider';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="top-right"
      richColors
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--success-bg)',
          '--success-text': 'var(--success-fg)',
          '--success-border': 'var(--success-bg)',
          '--error-bg': 'var(--destructive-bg)',
          '--error-text': 'var(--destructive-fg)',
          '--error-border': 'var(--destructive-bg)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
export { toast } from 'sonner';
