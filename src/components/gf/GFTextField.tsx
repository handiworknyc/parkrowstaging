'use client';

import React, { useRef } from 'react';
import { useTextField, useFocusRing } from 'react-aria';
import FloatingField from '../form/FloatingField';

type Props = {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  isRequired?: boolean;
  placeholder?: string;
  floatingLabel?: boolean;
  type?: string;

  /* server validation */
  error?: boolean;
  errorMessage?: string;
};

function normalizePhoneDigits(value: string) {
  const digits = value.replace(/\D/g, '');

  // Handle US autofill country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return digits.slice(0, 10);
}

function formatPhone(value: string) {
  const digits = normalizePhoneDigits(value);

  if (digits.length < 4) return digits;

  if (digits.length < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}


function extractDigits(value: string) {
  return value.replace(/\D/g, '');
}

export default function GFTextField({
  label,
  value = '',
  onChange,
  isRequired,
  placeholder,
  floatingLabel = false,
  type = 'text',

  error = false,
  errorMessage,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const isPhone = type === 'tel';

  const displayValue = isPhone
    ? formatPhone(value)
    : value;

  const {
    labelProps,
    inputProps,
    errorMessageProps,
  } = useTextField(
    {
      label,
      value: displayValue,
      isRequired,
      placeholder: floatingLabel ? undefined : placeholder,
      validationState: error ? 'invalid' : 'valid',

      onChange: (val) => {
        if (!onChange) return;

		if (isPhone) {
			onChange(normalizePhoneDigits(val));
		} else {
          onChange(val);
        }
      },
    },
    ref
  );

  const { isFocused, focusProps } = useFocusRing();

  return (
    <FloatingField
      label={label}
      labelProps={labelProps}
      floating={floatingLabel}
      isFocused={isFocused}
      hasValue={!!value}
      isRequired={isRequired}
      hasError={error}
    >
      <input
        {...inputProps}
        {...focusProps}
        ref={ref}
        type={type}
        inputMode={isPhone ? 'tel' : undefined}
        autoComplete={isPhone ? 'tel' : undefined}
        aria-invalid={error || undefined}
        className={[
          'gf-input',
          'input-text',
          error && 'gf-error',
        ]
          .filter(Boolean)
          .join(' ')}
      />

      {error && errorMessage && (
        <div
          {...errorMessageProps}
          className="gf-error-message sr-only"
        >
          {errorMessage}
        </div>
      )}
    </FloatingField>
  );
}
