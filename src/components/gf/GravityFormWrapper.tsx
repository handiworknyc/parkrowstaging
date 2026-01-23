import React, { useMemo, useState } from 'react';
import GravityForm from './GravityForm';
import type { GFFormSchema } from './GravityForm';

type Props = {
  formId: number;
};

/* ================================================
   STATIC JSON REGISTRY (BUILD-TIME)
================================================ */
const formModules = import.meta.glob<
  true,
  string,
  { default: GFFormSchema }
>(
  '../../content/wp/forms/form-*.json',
  { eager: true }
);

export default function GravityFormWrapper({ formId }: Props) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useMemo(() => {
    const key = `../../content/wp/forms/form-${formId}.json`;
    return formModules[key]?.default ?? null;
  }, [formId]);

  if (!form) {
    console.error(`Missing Gravity Form JSON: form-${formId}.json`);
    return null;
  }

  return (
    <GravityForm
      form={form}
      onSuccess={(msg) => {
        (window as any).__GF_CONFIRMATION__ = msg;
        window.dispatchEvent(new Event('gf-confirmation'));
        setSuccessMessage(msg);
      }}
    />
  );
}
