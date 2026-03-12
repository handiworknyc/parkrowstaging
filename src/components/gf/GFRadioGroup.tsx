'use client';

import React from 'react';
import { useRadioGroup } from 'react-aria';
import { useRadioGroupState } from 'react-stately';
import { GFRadioItem } from './GFRadioItem';

type Option = { text: string; value: string };

type Props = {
  label: string;
  options: Option[];
  value?: string;
  onChange?: (val: string) => void;
  isRequired?: boolean;

  /** ✅ server validation */
  error?: boolean;
  errorMessage?: string;
};

export default function GFRadioGroup({
  label,
  options,
  value,
  onChange,
  isRequired,

  error = false,
  errorMessage,
}: Props) {
  const state = useRadioGroupState({
    ...(value !== undefined ? { value } : {}),
    onChange,
    isRequired,
  });

  const { radioGroupProps } = useRadioGroup(
    {
      label,
      isRequired,
      validationState: error ? 'invalid' : 'valid',
    },
    state
  );

  return (
    <fieldset
      {...radioGroupProps}
      className={[
        'gf-field',
        'field-radio',
        error && 'gf-error',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* accessibility only */}
      <legend className="sr-only">{label}</legend>

      <div className="gf-radio-row">
        <div className="gf-radio-label">
          {label}
          {isRequired && (
            <span
              className="gf-required-asterisk"
              aria-hidden="true"
            >
              *
            </span>
          )}
        </div>

        <div className="gf-radio-options">
          {options.map((o) => (
            <GFRadioItem
              key={o.value}
              text={o.text}
              value={o.value}
              state={state}
            />
          ))}
        </div>
      </div>

      {error && errorMessage && (
        <div className="gf-error-message sr-only">
          {errorMessage}
        </div>
      )}
    </fieldset>
  );
}
