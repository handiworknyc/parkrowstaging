import React, { useEffect, useMemo, useState } from 'react';
import GravityForm from './GravityForm';
import type { GFFormSchema } from './GravityForm';

/* =====================================================
   STATIC FORM REGISTRY (NETLIFY SAFE)
===================================================== */

// ✅ Explicit imports — REQUIRED for Netlify SSR
import form1 from '../../content/wp/forms/form-1.json';

const FORMS: Record<number, GFFormSchema> = {
  1: form1,
};

/* =====================================================
   TYPES
===================================================== */

type Props = {
  formId: number;
};

/* =====================================================
   DEBUG HELPER
===================================================== */

function setDebug(data: any) {
  if (typeof window === 'undefined') return;

  (window as any).__GF_DEBUG__ = {
    ...(window as any).__GF_DEBUG__,
    ...data,
  };
}

/* =====================================================
   COMPONENT
===================================================== */

export default function GravityFormWrapper({ formId }: Props) {
  const [clientReady, setClientReady] = useState(false);

  /* -------------------------------------------
     CLIENT CONFIRMATION
  ------------------------------------------- */
  useEffect(() => {
    setClientReady(true);

    console.log('[GFWrapper] available forms:', Object.keys(FORMS));

    setDebug({
      availableForms: Object.keys(FORMS),
      requestedFormId: formId,
    });
  }, [formId]);

  /* -------------------------------------------
     RESOLVE FORM
  ------------------------------------------- */
  const form = useMemo(() => {
    const resolved = FORMS[formId] ?? null;

    setDebug({
      resolvedFormId: formId,
      hasForm: !!resolved,
    });

    return resolved;
  }, [formId]);


  /* -------------------------------------------
     MISSING FORM DEBUG
  ------------------------------------------- */
  if (!form) {
    return (
      <div className="gf-debug p-4 border border-red-500 text-red-600">
        <div className="font-bold mb-2">
          GravityFormWrapper: form JSON not found
        </div>

        <div>
          Requested form ID: <code>{formId}</code>
        </div>

        <div className="mt-2 text-sm opacity-80">
          Available forms:{' '}
          <code>{Object.keys(FORMS).join(', ') || 'none'}</code>
        </div>

        <div className="mt-2 text-sm opacity-80">
          Inspect <code>window.__GF_DEBUG__</code> in DevTools.
        </div>
      </div>
    );
  }

  /* -------------------------------------------
     RENDER
  ------------------------------------------- */
  return (
    <GravityForm
      form={form}
      onSuccess={(msg) => {
        (window as any).__GF_CONFIRMATION__ = msg;
        window.dispatchEvent(new Event('gf-confirmation'));
      }}
    />
  );
}
