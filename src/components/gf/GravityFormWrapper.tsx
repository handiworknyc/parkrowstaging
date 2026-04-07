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

const INQUIRE_FORM_ID = 1;
const STATE_FIELD_ID = 17;
const COUNTRY_FIELD_ID = 18;
const NEW_YORK_DISCLOSURE_FIELD_ID = 22;
const UNITED_STATES = 'United States';
const NEW_YORK = 'New York';
const NEW_YORK_DISCLOSURE_TEXT =
  'Oral representations cannot be relied upon as correctly stating representations of the developer. The Developer is not incorporated in, located in, nor a resident of, New York. This is not intended to be an offer to sell, or solicitation of an offer to buy, condominium units in New York or to residents of New York, or in any other jurisdiction where prohibited by law unless the condominium is registered in such jurisdictions or exempt. Your eligibility for purchase will depend upon your state of residency. This offering is not directed to any person or entity in New York by, or on behalf of, the developer or anyone acting with the developer’s knowledge. No purchase or sale shall take place as a result of this offering, until registration and filing requirements are met, or exemptions are confirmed.';

const NEW_YORK_DISCLOSURE_FIELD: GFFormSchema['fields'][number] = {
  id: NEW_YORK_DISCLOSURE_FIELD_ID,
  type: 'checkbox',
  label: 'New York disclosure',
  description: NEW_YORK_DISCLOSURE_TEXT,
  isRequired: true,
  placeholder: '',
  choices: [
    {
      text: 'I agree to the terms above',
      value: 'I agree to the terms above',
      isSelected: false,
    },
  ],
  conditionalLogic: {
    enabled: true,
    actionType: 'show',
    logicType: 'all',
    rules: [
      {
        fieldId: STATE_FIELD_ID,
        operator: 'is',
        value: NEW_YORK,
      },
    ],
  },
};

function withInquireFormOverrides(form: GFFormSchema): GFFormSchema {
  if (Number(form.id) !== INQUIRE_FORM_ID) return form;

  let hasNewYorkDisclosure = false;

  const fields = form.fields.map((field) => {
    if (Number(field.id) === NEW_YORK_DISCLOSURE_FIELD_ID) {
      hasNewYorkDisclosure = true;
      return NEW_YORK_DISCLOSURE_FIELD;
    }

    if (
      Number(field.id) === COUNTRY_FIELD_ID &&
      field.type === 'select' &&
      field.choices?.length
    ) {
      return {
        ...field,
        choices: field.choices.map((choice) => ({
          ...choice,
          isSelected: choice.value === UNITED_STATES,
        })),
      };
    }

    return field;
  });

  if (!hasNewYorkDisclosure) {
    const stateFieldIndex = fields.findIndex(
      (field) => Number(field.id) === STATE_FIELD_ID
    );
    const nextFields = [...fields];

    nextFields.splice(
      stateFieldIndex >= 0 ? stateFieldIndex + 1 : nextFields.length,
      0,
      NEW_YORK_DISCLOSURE_FIELD
    );

    return {
      ...form,
      fields: nextFields,
    };
  }

  return {
    ...form,
    fields,
  };
}

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
    const resolved = FORMS[formId]
      ? withInquireFormOverrides(FORMS[formId])
      : null;

    setDebug({
      resolvedFormId: formId,
      hasForm: !!resolved,
      hasNewYorkDisclosure: !!resolved?.fields.some(
        (field) => Number(field.id) === NEW_YORK_DISCLOSURE_FIELD_ID
      ),
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
