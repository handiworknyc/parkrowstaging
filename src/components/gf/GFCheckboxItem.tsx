'use client';

import React, { useRef } from 'react';
import { useCheckbox } from 'react-aria';
import { useToggleState } from 'react-stately';

type Props = {
  label: string;
  value: string;
  isSelected?: boolean;
  onChange?: (checked: boolean) => void;
};

export function GFCheckboxItem({
  label,
  value,
  isSelected = false,
  onChange,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const state = useToggleState({
    isSelected,
    onChange,
  });

  const { inputProps } = useCheckbox(
    {
      value,
      children: label,
    },
    state,
    ref
  );

  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        {...inputProps}
        ref={ref}
        className="sr-only"
      />

      <span
        className={`
          h-5 w-5 rounded border border-gray-300
          flex items-center justify-center
          transition
          ${state.isSelected ? 'bg-emerald-600 border-emerald-600' : ''}
        `}
      >
        {state.isSelected && (
          <svg
            viewBox="0 0 20 20"
            className="h-3 w-3 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <polyline points="4 11 8 15 16 6" />
          </svg>
        )}
      </span>

      <span className="text-sm">{label}</span>
    </label>
  );
}
