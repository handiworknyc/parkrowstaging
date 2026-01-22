'use client';

import React from 'react';
import { useCheckboxGroup } from 'react-aria';
import { useCheckboxGroupState } from 'react-stately';
import FloatingField from './FloatingField';
import { GFCheckboxItem } from './GFCheckboxItem';

type Option = {
  label: string;
  value: string;
};

type Props = {
  label: string;
  options: Option[];
  value?: string[];
  onChange?: (val: string[]) => void;
  isRequired?: boolean;
  floatingLabel?: boolean;
};

export function GFCheckboxGroup({
  label,
  options,
  value = [],
  onChange,
  isRequired,
  floatingLabel = false,
}: Props) {
  const state = useCheckboxGroupState({
    value,
    onChange,
    isRequired,
  });

  const { groupProps, labelProps } = useCheckboxGroup(
    { label },
    state
  );

  return (
    <FloatingField
      label={label}
      floating={floatingLabel}
      isFocused={false}
      hasValue={value.length > 0}
    >
      <div {...groupProps} className="space-y-3 pt-6">
        <span {...labelProps} className="sr-only">
          {label}
        </span>

        {options.map((o) => (
          <GFCheckboxItem
            key={o.value}
            label={o.label}
            value={o.value}
            isSelected={value.includes(o.value)}
            onChange={(checked) => {
              const next = checked
                ? [...value, o.value]
                : value.filter((v) => v !== o.value);

              onChange?.(next);
            }}
          />
        ))}
      </div>
    </FloatingField>
  );
}
