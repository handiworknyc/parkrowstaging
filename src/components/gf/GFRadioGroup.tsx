'use client';

import React from 'react';
import { useRadioGroup } from 'react-aria';
import { useRadioGroupState } from 'react-stately';
import FloatingField from './FloatingField';
import { GFRadioItem } from './GFRadioItem';

type Option = {
  label: string;
  value: string;
};

type Props = {
  label: string;
  options: Option[];
  value?: string;
  onChange?: (val: string) => void;
  isRequired?: boolean;
  floatingLabel?: boolean;
};

export function GFRadioGroup({
  label,
  options,
  value,
  onChange,
  isRequired,
  floatingLabel = false,
}: Props) {
  const state = useRadioGroupState({
    value,
    onChange,
    isRequired,
  });

  const { radioGroupProps, labelProps } = useRadioGroup(
    { label },
    state
  );

  return (
    <FloatingField
      label={label}
      floating={floatingLabel}
      isFocused={false}
      hasValue={!!value}
    >
      <div {...radioGroupProps} className="space-y-3 pt-6">
        <span {...labelProps} className="sr-only">
          {label}
        </span>

        {options.map((o) => (
          <GFRadioItem
            key={o.value}
            label={o.label}
            value={o.value}
            state={state}
          />
        ))}
      </div>
    </FloatingField>
  );
}
