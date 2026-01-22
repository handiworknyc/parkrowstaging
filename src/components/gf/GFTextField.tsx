'use client';

import React, { useRef } from 'react';
import { useTextField } from 'react-aria';
import FloatingField from './FloatingField';

type Props = {
  label: string;
  value?: string;
  onChange?: (val: string) => void;
  isRequired?: boolean;
  placeholder?: string;
  floatingLabel?: boolean;
  type?: string;
};

export function GFTextField({
  label,
  value = '',
  onChange,
  isRequired,
  placeholder,
  floatingLabel = false,
  type = 'text',
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const { labelProps, inputProps, isFocused } = useTextField(
    {
      label,
      value,
      onChange,
      isRequired,
      placeholder: floatingLabel ? '' : placeholder,
    },
    ref
  );

  return (
    <FloatingField
      label={label}
      floating={floatingLabel}
      isFocused={isFocused}
      hasValue={!!value}
    >
      <input
        {...inputProps}
        {...labelProps}
        ref={ref}
        type={type}
        className="
          w-full rounded-lg border border-gray-300
          px-3 pt-6 pb-2
          focus:outline-none focus:ring-2 focus:ring-emerald-500
        "
      />
    </FloatingField>
  );
}
