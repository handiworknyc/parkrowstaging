'use client';

import React, { useRef } from 'react';
import { useRadio } from 'react-aria';

type Props = {
  label: string;
  value: string;
  state: any;
};

export function GFRadioItem({ label, value, state }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const { inputProps } = useRadio(
    { value, children: label },
    state,
    ref
  );

  const isSelected = state.selectedValue === value;

  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        {...inputProps}
        ref={ref}
        className="sr-only"
      />

      <span
        className={`
          h-5 w-5 rounded-full border border-gray-300
          flex items-center justify-center
          transition
          ${isSelected ? 'border-emerald-600' : ''}
        `}
      >
        {isSelected && (
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
        )}
      </span>

      <span className="text-sm">{label}</span>
    </label>
  );
}
