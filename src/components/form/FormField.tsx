'use client';

import React, { useId } from 'react';

type Props = {
  label: string;
  children: React.ReactElement;

  required?: boolean;
  description?: string;

  /* ✅ server validation */
  error?: boolean;
  errorMessage?: string;
};

export default function FormField({
  label,
  children,
  required,
  description,

  error = false,
  errorMessage,
}: Props) {
  const id = useId();

  const labelId = `${id}-label`;
  const descriptionId = description
    ? `${id}-description`
    : undefined;

  const errorId = error
    ? `${id}-error`
    : undefined;

  return (
    <div
      className={[
        'form-field',
        error && 'form-field-error',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label id={labelId}>
        {label}
        {required && (
          <span aria-hidden="true">*</span>
        )}
      </label>

      {description && (
        <p id={descriptionId}>
          {description}
        </p>
      )}

      {React.cloneElement(children, {
        'aria-labelledby': labelId,
        'aria-describedby': [
          descriptionId,
          errorId,
        ]
          .filter(Boolean)
          .join(' '),
        'aria-invalid': error || undefined,
        'aria-errormessage': errorId,
        required,
        'aria-required': required,
      })}

      {error && errorMessage && (
        <p
          id={errorId}
          className="form-field-error-message"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
