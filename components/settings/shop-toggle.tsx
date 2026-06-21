'use client';

import { cn } from '@/lib/utils';

interface ShopToggleProps {
  active: boolean;
  onToggle: (active: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function ShopToggle({ active, onToggle, disabled, label }: ShopToggleProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={active}
        disabled={disabled}
        onClick={() => onToggle(!active)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
          active ? 'bg-emerald-500' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform',
            active ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
      <span className={cn('text-xs font-medium', active ? 'text-emerald-700' : 'text-muted-foreground')}>
        {active ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
