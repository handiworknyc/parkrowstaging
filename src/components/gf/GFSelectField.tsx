'use client';

import React, { useId } from 'react';
import FloatingField from '../form/FloatingField';

type Option = {
  text: string;
  value: string;
};

type Props = {
  label: string;
  name?: string;
  options: Option[];
  value?: string;
  onChange?: (val: string) => void;
  isRequired?: boolean;

  /** ✅ server validation */
  error?: boolean;
  errorMessage?: string;
};

export default function GFSelectField({
  label,
  name,
  options,
  value = '',
  onChange,
  isRequired = false,

  error = false,
  errorMessage,
}: Props) {
  const id = useId();
  const hasValue = value !== '';

  return (
    <FloatingField
      label={label}
      floating
      isFocused={false}
      hasValue={value !== ''}
      isRequired={isRequired}
      hasError={error}
    >
      <select
        id={id}
        name={name}
        value={value}
        onInput={(e) => onChange?.(e.currentTarget.value)}
        onChange={(e) => onChange?.(e.target.value)}
        required={isRequired}
        aria-required={isRequired}
        aria-invalid={error || undefined}
        data-has-value={hasValue ? 'true' : 'false'}
        className={[
          'input-select',
          error && 'gf-error',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <option value="" disabled hidden>
          Select…
        </option>

        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>

      {error && errorMessage && (
        <div className="gf-error-message sr-only">
          {errorMessage}
        </div>
      )}
    </FloatingField>
  );
}
