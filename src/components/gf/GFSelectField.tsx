'use client';

import React, { useRef } from 'react';
import { useSelect } from 'react-aria';
import { useSelectState } from 'react-stately';
import FloatingField from './FloatingField';

type Option = {
  label: string;
  value: string;
};

type Props = {
  label: string;
  options: Option[];
  value?: string;
  onChange?: (val: string) => void;
  floatingLabel?: boolean;
};

export function GFSelectField({
  label,
  options,
  value,
  onChange,
  floatingLabel = false,
}: Props) {
  const ref = useRef<HTMLSelectElement>(null);

  const state = useSelectState({
    selectedKey: value,
    onSelectionChange: (key) => onChange?.(String(key)),
    items: options.map((o) => ({
      key: o.value,
      textValue: o.label,
    })),
  });

  const { triggerProps, isFocused } = useSelect({}, state, ref);

  return (
    <FloatingField
      label={label}
      floating={floatingLabel}
      isFocused={isFocused}
      hasValue={!!value}
    >
      <select
        ref={ref}
        {...triggerProps}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="
          w-full rounded-lg border border-gray-300
          px-3 pt-6 pb-2 bg-white
          focus:outline-none focus:ring-2 focus:ring-emerald-500
        "
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FloatingField>
  );
}
