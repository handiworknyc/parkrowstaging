'use client';

import React from 'react';

type Props = {
  label: string;
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
  isFocused: boolean;
  hasValue: boolean;
  floating?: boolean;
  isRequired?: boolean;

  /* ✅ new */
  hasError?: boolean;

  children: React.ReactNode;
};

export default function FloatingField({
  label,
  labelProps,
  isFocused,
  hasValue,
  floating = false,
  isRequired = false,
  hasError = false,
  children,
}: Props) {
  const active = isFocused || hasValue;

  const LabelContent = (
    <>
      {label}
      {isRequired && (
        <span
          className="gf-required-asterisk"
          aria-hidden="true"
        >
          *
        </span>
      )}
    </>
  );

  const wrapperClass = [
    floating ? 'gf-field-floating' : 'gf-field-standard',
    hasError && 'gf-field-error',
  ]
    .filter(Boolean)
    .join(' ');

  if (!floating) {
    return (
      <label
        {...labelProps}
        className={`flex flex-col gap-1 ${wrapperClass}`}
      >
        <span>{LabelContent}</span>
        {children}
      </label>
    );
  }

  return (
    <label
      {...labelProps}
      className={`relative block ${wrapperClass}`}
    >
      <span
        className={[
          'gf-floating-label',
          active && 'is-active',
          hasError && 'is-error',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {LabelContent}
      </span>

      {children}
    </label>
  );
}
