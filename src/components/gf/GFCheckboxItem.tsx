'use client';

import React, { useRef } from 'react';
import { useCheckbox } from 'react-aria';
import { useToggleState } from 'react-stately';
import { motion, AnimatePresence } from 'motion/react';

type Props = {
  text: string;
  value: string;
  isSelected?: boolean;
  isRequired?: boolean;
  layout?: 'inline' | 'split';
  onChange?: (checked: boolean) => void;
};

export function GFCheckboxItem({
  text,
  value,
  isSelected = false,
  isRequired,
  layout = 'inline',
  onChange,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const state = useToggleState({
    isSelected,
    onChange,
  });

  const { inputProps } = useCheckbox(
    {
      value,
      children: text,
    },
    state,
    ref
  );

  return (
    <label
      className={[
        'gf-checkbox-item',
        layout === 'split' && 'gf-checkbox-item--split',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        {...inputProps}
        ref={ref}
        className="sr-only peer"
        aria-required={isRequired}
      />

      {/* Checkbox */}
      <span
        className={`
          gf-checkbox-box
          relative
          h-7 w-7
          rounded
          border-2
          transition-colors duration-200
          ${
            isSelected
              ? 'gf-checkbox-box--selected'
              : 'bg-transparent border-black'
          }
        `}
      >
        <AnimatePresence>
          {isSelected && (
            <motion.svg
              key="check"
              viewBox="0 0 20 20"
              className="
                gf-checkbox-check
                absolute
                left-1/2 top-1/2
                h-[1.1rem] w-[1.1rem]
              "
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ scale: 0.6, x: '-50%', y: '-50%' }}
              animate={{ scale: 1, x: '-50%', y: '-50%' }}
              exit={{ scale: 0.6, x: '-50%', y: '-50%' }}
              transition={{
                type: 'spring',
                stiffness: 520,
                damping: 34,
                mass: 0.6,
              }}
            >
              <motion.polyline
                points="2.5 10.5 8.5 16 17.5 4"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                exit={{ pathLength: 0 }}
                transition={{
                  duration: 0.25,
                  ease: 'easeOut',
                }}
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>

      <span className="gf-checkbox-item-text">{text}</span>
    </label>
  );
}
