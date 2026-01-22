'use client';

import React, { useRef } from 'react';
import { useTextField } from 'react-aria';
import FloatingField from './FloatingField';

type Props = {
  label: string;
  value?: string;
  onChange?: (val: string) => void;
  isRequired?: boolean;
  floatingLabel?: boolean;
};

export function GFTextareaField({
  label,
  value = '',
  onChange,
  isRequired,
  floatingLabel = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const { inputProps, isFocused } = useTextField(
    {
      label,
      value,
      onChange,
      isRequired,
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
      <textarea
        {...inputProps}
        ref={ref}
        rows={4}
        className="
          w-full rounded-lg border border-gray-300
          px-3 pt-6 pb-2 resize-none
          focus:outline-none focus:ring-2 focus:ring-emerald-500
        "
      />
    </FloatingField>
  );
}
