'use client';

import React from 'react';
import clsx from 'clsx';

type Props = {
  label: string;
  isFocused: boolean;
  hasValue: boolean;
  floating?: boolean;
  children: React.ReactNode;
};

export default function FloatingField({
  label,
  isFocused,
  hasValue,
  floating = false,
  children,
}: Props) {
  if (!floating) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
    );
  }

  const active = isFocused || hasValue;

  return (
    <label className="relative block">
      <span
        className={clsx(
          'pointer-events-none absolute left-3 transition-all duration-200 origin-left',
          active
            ? 'top-1 text-xs scale-90 text-gray-500'
            : 'top-1/2 -translate-y-1/2 text-sm text-gray-400'
        )}
      >
        {label}
      </span>

      {children}
    </label>
  );
}
