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

type GFChoice = { label: string; value: string };

type GFFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'radio' | 'select';

type GFField = {
  id: number;
  type: GFFieldType;
  label: string;
  isRequired?: boolean;
  placeholder?: string;
  choices?: GFChoice[];
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

/* =====================================================
   COMPONENT
===================================================== */

export default function GravityForm({ form, onSuccess }: Props) {
  if (!form || !Array.isArray(form.fields)) return null;

  /* -------------------------------------------------- */
  /* STATE */
  /* -------------------------------------------------- */

  const [values, setValues] = useState<Record<string, any>>({});
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

    for (const field of form.fields) {
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
  }, [form.fields, values]);

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

      for (const field of form.fields) {
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

      const isDev = import.meta.env.DEV;
      const endpoint = isDev 
        ? '/api/gf/submit'
        : '/.netlify/functions/gf-submit';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: form.id,
          fields: submissionValues,
        }),
      });

      const text = await res.text();
      const parsed = safeJsonParse(text);

      if (!parsed.ok) {
        throw new Error('Invalid server response');
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
  }, [submitting, form, values, validateClientSide]);

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
        {form.fields.map((f) => {
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
