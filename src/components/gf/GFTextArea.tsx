'use client';

import React, { useRef } from 'react';
import { useTextField } from 'react-aria';
import FloatingField from '../form/FloatingField';

type Props = {
  label: string;
  value?: string;
  onChange?: (val: string) => void;
  isRequired?: boolean;
  floatingLabel?: boolean;
  placeholder?: string;
};

export default function GFTextareaField({
  label,
  value = '',
  onChange,
  isRequired,
  floatingLabel = false,
  placeholder,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const { labelProps, inputProps, isFocused } = useTextField(
    {
      label,
      value,
      onChange,
      isRequired,
      placeholder: floatingLabel ? undefined : placeholder,
    },
    ref
  );

  return (
    <FloatingField
      label={label}
      labelProps={labelProps}
      floating={floatingLabel}
      isFocused={isFocused}
      hasValue={!!value}
    >
      <textarea
        {...inputProps}
        ref={ref}
        rows={4}
        required={isRequired}
        aria-required={isRequired}
      />
    </FloatingField>
  );
}
