import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';

import GFTextField from './GFTextField';
import GFTextareaField from './GFTextArea';
import GFCheckboxGroup from './GFCheckboxGroup';
import GFRadioGroup from './GFRadioGroup';
import GFSelectField from './GFSelectField';

import LogoLoader from './LogoLoader';

/* =====================================================
   TYPES
===================================================== */

type GFChoice = {
  text: string;
  value: string;
  isSelected?: boolean;
};

type GFConditionalRule = {
  fieldId: number;
  operator: string;
  value: string;
};

type GFConditionalLogic = {
  enabled?: boolean;
  actionType?: 'show' | 'hide';
  logicType?: 'all' | 'any';
  rules?: GFConditionalRule[];
};

type GFFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'radio' | 'select';

type GFField = {
  id: number;
  type: GFFieldType;
  label: string;
  description?: string;
  isRequired?: boolean;
  placeholder?: string;
  choices?: GFChoice[];
  conditionalLogic?: GFConditionalLogic;
};

export type GFFormSchema = {
  id: number;
  title: string;
  description?: string;
  fields: GFField[];
};

type Props = {
  form: GFFormSchema;
  onSuccess?: (message: string) => void;
};

/* =====================================================
   CONSTANTS
===================================================== */

const CONSTANTS = {
  SCROLL_OFFSET: 120,
  ANIMATION_DURATION: 0.8,
  PHONE_DIGITS_REQUIRED: 10,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SMOOTH_EASE: [0.25, 0.1, 0.25, 1] as const,
} as const;

/* =====================================================
   UTILS
===================================================== */

function safeJsonParse(text: string): 
  | { ok: true; data: any }
  | { ok: false; error: unknown } {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function extractSubmitError(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') {
    return 'Unable to submit form. Please try again.';
  }

  if (typeof parsed.message === 'string' && parsed.message.trim()) {
    return parsed.message;
  }

  if (
    parsed.validation_messages &&
    typeof parsed.validation_messages === 'object'
  ) {
    const firstMessage = Object.values(parsed.validation_messages).find(
      (value) => typeof value === 'string' && value.trim().length > 0
    );

    if (typeof firstMessage === 'string') {
      return firstMessage.replace(/<\/?[^>]+>/g, '').trim();
    }
  }

  return 'Unable to submit form. Please try again.';
}

function shouldEdgewiseDebug(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;

  const value =
    new URLSearchParams(window.location.search).get('edgewiseDebug') || '';

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeConditionalValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function matchesConditionalRule(ruleValue: unknown, operator: string, expectedValue: string): boolean {
  const expected = normalizeConditionalValue(expectedValue);

  if (Array.isArray(ruleValue)) {
    const values = ruleValue.map((value) => normalizeConditionalValue(value));

    switch (operator) {
      case 'is':
      case '=':
      case '==':
      case 'contains':
        return values.includes(expected);
      case 'isnot':
      case '!=':
      case '<>':
      case 'not in':
        return !values.includes(expected);
      case 'empty':
        return values.length === 0;
      case 'not_empty':
        return values.length > 0;
      default:
        return values.includes(expected);
    }
  }

  const actual = normalizeConditionalValue(ruleValue);
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  const hasNumericComparison =
    actual !== '' &&
    expected !== '' &&
    !Number.isNaN(actualNumber) &&
    !Number.isNaN(expectedNumber);

  switch (operator) {
    case 'is':
    case '=':
    case '==':
      return actual === expected;
    case 'isnot':
    case '!=':
    case '<>':
      return actual !== expected;
    case 'contains':
      return actual.includes(expected);
    case 'starts_with':
      return actual.startsWith(expected);
    case 'ends_with':
      return actual.endsWith(expected);
    case '>':
      return hasNumericComparison ? actualNumber > expectedNumber : actual > expected;
    case '<':
      return hasNumericComparison ? actualNumber < expectedNumber : actual < expected;
    case 'empty':
      return actual === '';
    case 'not_empty':
      return actual !== '';
    default:
      return actual === expected;
  }
}

function isFieldVisible(field: GFField, values: Record<string, any>): boolean {
  const logic = field.conditionalLogic;
  const rules = logic?.rules ?? [];

  if (!logic?.enabled || !rules.length) {
    return true;
  }

  const matches = rules.map((rule) =>
    matchesConditionalRule(values[`input_${rule.fieldId}`], rule.operator, rule.value)
  );

  const passes = logic.logicType === 'any'
    ? matches.some(Boolean)
    : matches.every(Boolean);

  return logic.actionType === 'hide' ? !passes : passes;
}

function buildInitialValues(form: GFFormSchema): Record<string, any> {
  const initialValues: Record<string, any> = {};

  for (const field of form.fields) {
    const selectedChoices = field.choices?.filter((choice) => choice.isSelected) ?? [];

    if (!selectedChoices.length) continue;

    if (field.type === 'checkbox') {
      initialValues[`input_${field.id}`] = selectedChoices.map((choice) => choice.value);
      continue;
    }

    if (field.type === 'radio' || field.type === 'select') {
      initialValues[`input_${field.id}`] = selectedChoices[0].value;
    }
  }

  return initialValues;
}

/* =====================================================
   COMPONENT
===================================================== */

export default function GravityForm({ form, onSuccess }: Props) {
  if (!form || !Array.isArray(form.fields)) return null;

  /* -------------------------------------------------- */
  /* STATE */
  /* -------------------------------------------------- */

  const [values, setValues] = useState<Record<string, any>>(() =>
    buildInitialValues(form)
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [showLoader, setShowLoader] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);

  const [animationReady, setAnimationReady] = useState(false);
  const [requestReady, setRequestReady] = useState(false);

  const [loaderPhase, setLoaderPhase] = useState<
    'idle' | 'filling' | 'readyToFade'
  >('idle');

  const submitCountRef = useRef(0);
  const didAutoFocusRef = useRef(false);

  useEffect(() => {
    setValues(buildInitialValues(form));
    setFieldErrors({});
  }, [form]);

  useEffect(() => {
	return () => {
		document.body.classList.remove('gf-success-active');
		delete (window as any).__GF_CONFIRMATION__;
	};
	}, []);

  /* =====================================================
     COORDINATION LOGIC (OPTIMIZED)
  ===================================================== */

	useEffect(() => {
	if (!animationReady || !requestReady || !pendingMessage) return;

	onSuccess?.(pendingMessage);

	setPendingMessage(null);
	setSubmitting(false);
	setIsSuccess(true);
	setLoaderPhase('readyToFade');

	(window as any).__GF_CONFIRMATION__ = pendingMessage;
	window.dispatchEvent(new Event('gf-confirmation'));

	document.body.classList.add('gf-success-active');
	}, [animationReady, requestReady, pendingMessage, onSuccess]);

  /* =====================================================
     SCROLL TO TOP WHEN LOADER APPEARS
  ===================================================== */

  useEffect(() => {
    if (!showLoader) return;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });
  }, [showLoader]);

  /* =====================================================
     CALLBACKS
  ===================================================== */

  const handleAlmostDone = useCallback(() => {
    setAnimationReady(true);
  }, []);

  const handleFadeComplete = useCallback(() => {
    setShowLoader(false);
    setLoaderPhase('idle');
  }, []);

  /* =====================================================
     FIELD STATE
  ===================================================== */

  const set = useCallback((id: number, val: any) => {
    const key = `input_${id}`;

    setValues((v) => ({ ...v, [key]: val }));

    setFieldErrors((errors) => {
      if (!errors[key]) return errors;
      const next = { ...errors };
      delete next[key];
      return next;
    });
  }, []);

  const visibleFields = form.fields.filter((field) => isFieldVisible(field, values));
  const visibleFieldKeys = visibleFields.map((field) => `input_${field.id}`);

  useEffect(() => {
    const visibleKeys = new Set(visibleFieldKeys);

    setFieldErrors((errors) => {
      const next = Object.fromEntries(
        Object.entries(errors).filter(([key]) => visibleKeys.has(key))
      );

      return Object.keys(next).length === Object.keys(errors).length ? errors : next;
    });
  }, [visibleFieldKeys.join('|')]);

  /* =====================================================
     AUTO-FOCUS FIRST ERROR
  ===================================================== */

  useEffect(() => {
    const keys = Object.keys(fieldErrors);
    if (!keys.length) return;
    if (didAutoFocusRef.current) return;

    didAutoFocusRef.current = true;

    requestAnimationFrame(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.gf-field.has-error'
        )
      );

      if (!els.length) return;

      const top = els.reduce((a, b) =>
        a.getBoundingClientRect().top <
        b.getBoundingClientRect().top
          ? a
          : b
      );

      window.scrollTo({
        top:
          window.scrollY +
          top.getBoundingClientRect().top -
          CONSTANTS.SCROLL_OFFSET,
        behavior: 'smooth',
      });

      top
        .querySelector<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input,select,textarea')
        ?.focus({ preventScroll: true });
    });
  }, [fieldErrors]);

  /* =====================================================
     CLIENT VALIDATION (OPTIMIZED)
  ===================================================== */

  const validateClientSide = useCallback((): Record<string, string> => {
    const errors: Record<string, string> = {};

    for (const field of visibleFields) {
      const key = `input_${field.id}`;
      const val = values[key];

      if (field.isRequired) {
        const empty =
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && !val.length);

        if (empty) {
          errors[key] = 'This field is required.';
          continue;
        }
      }

      if (field.type === 'email' && val) {
        if (!CONSTANTS.EMAIL_REGEX.test(String(val))) {
          errors[key] = 'Please enter a valid email address.';
        }
      }

      if (field.type === 'phone' && val) {
        const digits = String(
          typeof val === 'object'
            ? val.raw ?? val.value ?? ''
            : val
        ).replace(/\D/g, '');

        if (digits.length !== CONSTANTS.PHONE_DIGITS_REQUIRED) {
          errors[key] = `Please enter a valid ${CONSTANTS.PHONE_DIGITS_REQUIRED}-digit phone number.`;
        }
      }
    }

    // ✅ Reset auto-focus flag when new errors are generated
    if (Object.keys(errors).length > 0) {
      didAutoFocusRef.current = false;
    }

    return errors;
  }, [values, visibleFields]);

  /* =====================================================
     SUBMIT (OPTIMIZED)
  ===================================================== */

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !form?.id) return;

    submitCountRef.current++;

    const clientErrors = validateClientSide();

    if (Object.keys(clientErrors).length) {
      setFieldErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    setShowLoader(true);
    setLoaderPhase('filling');
    setIsSuccess(false);
    setMessage(null);
    setPendingMessage(null);
    setAnimationReady(false);
    setRequestReady(false);
    setFieldErrors({});

    try {
      const submissionValues: Record<string, any> = {};

      for (const field of visibleFields) {
        const base = `input_${field.id}`;

        if (field.type === 'checkbox') {
          const selected = Array.isArray(values[base])
            ? values[base]
            : [];

          field.choices?.forEach((choice, i) => {
            if (selected.includes(choice.value)) {
              submissionValues[`${base}.${i + 1}`] =
                choice.value;
            }
          });

          continue;
        }

        submissionValues[base] = values[base] ?? '';
      }

      const endpoint = '/api/gf/submit';
      const edgewiseDebug = shouldEdgewiseDebug();

      if (edgewiseDebug) {
        console.info('[GF] edgewise debug enabled', {
          fieldKeys: Object.keys(submissionValues).sort(),
          formId: form.id,
          url: window.location.href,
        });
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(edgewiseDebug ? { edgewise_debug: true } : {}),
          form_id: form.id,
          fields: submissionValues,
        }),
      });

      const text = await res.text();
      console.info('[GF] submit API response', {
        body: text,
        status: res.status,
        url: endpoint,
      });

      const parsed = safeJsonParse(text);

      if (!parsed.ok) {
        throw new Error('Invalid server response');
      }

      if (parsed.data?.edgewise) {
        if (parsed.data.edgewise.success) {
          console.info('[GF] edgewise debug', parsed.data.edgewise);
        } else {
          console.warn('[GF] edgewise debug', parsed.data.edgewise);
        }
      }

      if (!res.ok) {
        throw new Error(extractSubmitError(parsed.data));
      }

      const confirmation =
        parsed.data?.confirmation_message ??
        'Form submitted successfully.';

      setPendingMessage(
        confirmation
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/?[^>]+>/g, '')
          .trim()
      );

      setRequestReady(true);
    } catch (err: any) {
      console.error('Form submission error:', err);
      
      setMessage(
        err?.message || 
        'Unable to submit form. Please try again.'
      );
      setSubmitting(false);
      setShowLoader(false);
      setLoaderPhase('idle');
    }
  }, [submitting, form, values, validateClientSide, visibleFields]);

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <>
      <motion.form
        onSubmit={submit}
        className="gf-form flex flex-col justify-center"
        noValidate
        aria-busy={submitting}
        animate={{
          maxHeight: isSuccess
            ? 'calc(var(--jsVhUnits100) - var(--headerHeight))'
            : 'auto',
        }}
        transition={{ duration: CONSTANTS.ANIMATION_DURATION, ease: CONSTANTS.SMOOTH_EASE }}
        onAnimationComplete={() => {
          if (!isSuccess) return;

          // ✅ force layout recalculation
          window.dispatchEvent(new Event('resize'));
        }}
      >
        {visibleFields.map((f) => {
          const key = `input_${f.id}`;
          const value = values[key] ?? '';
          const error = fieldErrors[key];

          let field: React.ReactNode = null;

          switch (f.type) {
            case 'text':
            case 'email':
            case 'phone':
              field = (
                <GFTextField
                  label={f.label}
                  type={f.type === 'phone' ? 'tel' : f.type}
                  value={value}
                  isRequired={f.isRequired}
                  floatingLabel
                  error={!!error}
                  errorMessage={error}
                  onChange={(v) => set(f.id, v)}
                />
              );
              break;

            case 'textarea':
              field = (
                <GFTextareaField
                  label={f.label}
                  value={value}
                  isRequired={f.isRequired}
                  floatingLabel
                  error={!!error}
                  errorMessage={error}
                  onChange={(v) => set(f.id, v)}
                />
              );
              break;

            case 'checkbox':
              field = (
                <GFCheckboxGroup
                  label={f.label}
                  description={f.description}
                  value={value || []}
                  options={f.choices || []}
                  isRequired={f.isRequired}
                  error={!!error}
                  errorMessage={error}
                  onChange={(v) => set(f.id, v)}
                />
              );
              break;

            case 'radio':
              field = (
                <GFRadioGroup
                  label={f.label}
                  value={value}
                  options={f.choices || []}
                  isRequired={f.isRequired}
                  error={!!error}
                  errorMessage={error}
                  onChange={(v) => set(f.id, v)}
                />
              );
              break;

            case 'select':
              field = (
                <GFSelectField
                  label={f.label}
                  name={key}
                  value={value}
                  options={f.choices || []}
                  isRequired={f.isRequired}
                  error={!!error}
                  errorMessage={error}
                  onChange={(v) => set(f.id, v)}
                />
              );
              break;
          }

          return (
            <div
              key={f.id}
              className={[
                'gf-field',
                `field-${f.type}`,
                `field-id-${f.id}`,
                error && 'has-error',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {field}
            </div>
          );
        })}

        <div className="text-center">
          <button
            type="submit"
            className="mt-14 gf-submit icon-after icon-arrow-right"
            disabled={submitting}
          >
            <span>{submitting ? 'Sending…' : 'Submit'}</span>
          </button>
        </div>
      </motion.form>

      {showLoader && (
        <LogoLoader
          fadeOut={loaderPhase === 'readyToFade'}
          onAlmostDone={handleAlmostDone}
          onFadeComplete={handleFadeComplete}
        />
      )}
    </>
  );
}
