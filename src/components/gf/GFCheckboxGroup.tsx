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
  description?: string;
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
  description,
  options,
  value = [],
  onChange,
  isRequired,

  error = false,
  errorMessage,
}: Props) {
  const fieldDescription = description?.trim();
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

  const isSingleOption = options.length === 1;
  const singleOption = isSingleOption ? options[0] : null;
  const hasDescription = !!fieldDescription;

  if (singleOption) {
    return (
      <fieldset
        {...groupProps}
        className={[
          'gf-field',
          'field-checkbox',
          'field-checkbox-single',
          hasDescription && 'field-checkbox-with-description',
          error && 'gf-error',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <legend className="sr-only">{label}</legend>

        {hasDescription && (
          <div className="gf-checkbox-description">
            {fieldDescription}
          </div>
        )}

        <GFCheckboxItem
          value={singleOption.value}
          text={singleOption.text}
          layout={hasDescription ? 'inline' : 'split'}
          isSelected={value.includes(singleOption.value)}
          isRequired={isRequired}
          onChange={(checked) => {
            const next = checked
              ? [singleOption.value]
              : [];

            onChange?.(next);
          }}
        />

        {error && errorMessage && (
          <div className="gf-error-message sr-only">
            {errorMessage}
          </div>
        )}
      </fieldset>
    );
  }

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
        <div className="gf-checkbox-label">
          {label}
          {isRequired && (
            <span aria-hidden="true">*</span>
          )}
        </div>

        <div className="gf-checkbox-options">
          {options.map((o) => (
            <GFCheckboxItem
              key={o.value}
              value={o.value}
              text={o.text}
              layout="inline"
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
