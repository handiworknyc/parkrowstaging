'use client';

import React from 'react';
import { useCheckboxGroup } from 'react-aria';
import { useCheckboxGroupState } from 'react-stately';
import { GFCheckboxItem } from './GFCheckboxItem';

type Option = {
  text: string;
  value: string;
};

type Props = {
  label: string;
  options: Option[];
  value?: string[];
  onChange?: (val: string[]) => void;
  isRequired?: boolean;

  /* ✅ server validation */
  error?: boolean;
  errorMessage?: string;
};

export default function GFCheckboxGroup({
  label,
  options,
  value = [],
  onChange,
  isRequired,

  error = false,
  errorMessage,
}: Props) {
  const state = useCheckboxGroupState({
    value,
    onChange,
    isRequired,
  });

  const { groupProps } = useCheckboxGroup(
    {
      label,
      isRequired,
      validationState: error ? 'invalid' : 'valid',
    },
    state
  );

  return (
    <fieldset
      {...groupProps}
      className={[
        'gf-field',
        'field-checkbox',
        error && 'gf-error',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* accessibility only */}
      <legend className="sr-only">{label}</legend>

      <div className="gf-checkbox-row">
        {/* LEFT COLUMN */}
        <div className="gf-checkbox-label">
          {label}
          {isRequired && (
            <span aria-hidden="true">*</span>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="gf-checkbox-options">
          {options.map((o) => (
            <GFCheckboxItem
              key={o.value}
              value={o.value}
              text={o.text}
              isSelected={value.includes(o.value)}
              isRequired={isRequired}
              onChange={(checked) => {
                const next = checked
                  ? [...value, o.value]
                  : value.filter((v) => v !== o.value);

                onChange?.(next);
              }}
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
