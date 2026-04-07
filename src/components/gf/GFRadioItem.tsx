'use client';

import React, { useRef } from 'react';
import { useRadio } from 'react-aria';
import type { RadioGroupState } from 'react-stately';
import { motion, AnimatePresence } from 'motion/react';

type Props = {
  text: string;
  value: string;
  state: RadioGroupState;
};

export function GFRadioItem({ text, value, state }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const { inputProps } = useRadio(
    {
      value,
      children: text,
    },
    state,
    ref
  );

  const isSelected = state.selectedValue === value;

  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input
        {...inputProps}
        ref={ref}
        className="sr-only peer"
        aria-required={state.isRequired}
      />

      {/* Radio */}
      <span
        className={`
          relative
          h-5 w-5
          rounded-full
          border border-black
          transition-colors
          peer-focus-visible:outline
          peer-focus-visible:outline-1
          peer-focus-visible:outline-emerald-500
          peer-focus-visible:outline-offset-2
        `}
      >
        <AnimatePresence>
          {isSelected && (
            <motion.span
              key="dot"
              className="
                gf-radio-dot--selected
                absolute
                left-1/2 top-1/2
                h-2.5 w-2.5
                rounded-full
              "
              initial={{ scale: 0, x: '-50%', y: '-50%' }}
              animate={{ scale: 1, x: '-50%', y: '-50%' }}
              exit={{ scale: 0, x: '-50%', y: '-50%' }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30,
                mass: 0.6,
              }}
            />
          )}
        </AnimatePresence>
      </span>

      <span className="gf-radio-label">{text}</span>
    </label>
  );
}
