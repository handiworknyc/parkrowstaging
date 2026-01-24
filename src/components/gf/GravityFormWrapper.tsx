import React, { useMemo, useEffect, useState } from 'react';
import GravityForm from './GravityForm';
import type { GFFormSchema } from './GravityForm';

type Props = { formId: number };

const formModules = import.meta.glob<true, string, { default: GFFormSchema }>(
  '../../content/wp/forms/form-*.json',
  { eager: true }
);

function setDebug(data: any) {
  if (typeof window === 'undefined') return;
  (window as any).__GF_DEBUG__ = {
    ...(window as any).__GF_DEBUG__,
    ...data,
  };
}

export default function GravityFormWrapper({ formId }: Props) {
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);

    // dump keys once on client
    const keys = Object.keys(formModules);
    console.log('[GFWrapper] glob keys:', keys);
    setDebug({ globKeys: keys, formId });
  }, [formId]);

  const form = useMemo(() => {
    const want = `/form-${formId}.json`;

    const hit = Object.entries(formModules).find(([path]) =>
      path.replace(/\\/g, '/').endsWith(want)
    );

    const resolved = hit?.[1]?.default ?? null;

    setDebug({
      wanted: want,
      resolvedPath: hit?.[0] ?? null,
      hasForm: !!resolved,
    });

    return resolved;
  }, [formId]);

  if (!clientReady) {
    return (
      <div className="gf-debug p-4 border border-dashed">
        Initializing form…
      </div>
    );
  }

  if (!form) {
    return (
      <div className="gf-debug p-4 border border-red-500 text-red-600">
        <div className="font-bold mb-2">GravityFormWrapper: form JSON not found</div>
        <div>Requested: <code>form-{formId}.json</code></div>
        <div className="mt-2 text-sm opacity-80">
          Open DevTools → Console and search for <code>[GFWrapper]</code>.
          Also inspect <code>window.__GF_DEBUG__</code>.
        </div>
      </div>
    );
  }

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
