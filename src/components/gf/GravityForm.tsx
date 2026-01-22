'use client';

import React, { useEffect, useState } from 'react';

type GFField = {
  id: number;
  type: string;
  label: string;
  isRequired?: boolean;
  choices?: Array<{ text: string; value: string }>;
  placeholder?: string;
};

type GFFormSchema = {
  id: number;
  title: string;
  description?: string;
  fields: GFField[];
};

type Props = {
  formId: number;
};

export default function GravityForm({ formId }: Props) {
  const [form, setForm] = useState<GFFormSchema | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  console.log("GF fields:", form?.fields?.map(f => f.type));

  useEffect(() => {
  fetch(`/api/gf/form/${formId}`)
    .then((r) => r.json())
    .then((json) => {
      console.log("RAW GF RESPONSE:", json);

      const form =
        json?.form ||
        json?.data?.form ||
        json;

      if (!form?.fields) {
        console.error("GF schema missing fields:", form);
        setMessage("Invalid form schema");
        return;
      }

      console.log(
        "[GF] field types:",
        form.fields.map((f: any) => f.type)
      );

      setForm(form);
    })
    .catch((e) => {
      console.error("GF load error:", e);
      setMessage("Failed to load form");
    })
    .finally(() => setLoading(false));
}, [formId]);

  function set(id: number, val: any) {
    setValues((v) => ({ ...v, [`input_${id}`]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const res = await fetch('/api/gf/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formId,
        payload: values,
      }),
    });

    const json = await res.json();

    if (!json.ok) {
      setMessage(json.message || 'Submission failed');
    } else {
      setMessage(json.message || 'Thank you!');
    }

    setSubmitting(false);
  }

  if (loading) return <p>Loading…</p>;
  if (!form) return <p>Form unavailable.</p>;

  return (
    <form onSubmit={submit}>
		{form.fields.map((f) => {
		const key = `input_${f.id}`;
		const value = values[key] || '';

		switch (f.type) {
			case 'text':
			case 'email':
			case 'phone':
			return (
				<GFTextField
				key={f.id}
				label={f.label}
				type={f.type === 'phone' ? 'tel' : f.type}
				value={value}
				isRequired={f.isRequired}
				floatingLabel
				onChange={(v) => set(f.id, v)}
				/>
			);

			case 'textarea':
			return (
				<GFTextareaField
				key={f.id}
				label={f.label}
				value={value}
				floatingLabel
				onChange={(v) => set(f.id, v)}
				/>
			);

			case 'select':
			return (
				<GFSelectField
				key={f.id}
				label={f.label}
				floatingLabel
				value={value}
				options={
					f.choices?.map((c) => ({
					label: c.text,
					value: c.value,
					})) || []
				}
				onChange={(v) => set(f.id, v)}
				/>
			);

			default:
			return null;
		}
		})}


      <button disabled={submitting}>
        {submitting ? 'Sending…' : 'Submit'}
      </button>

      {message && <p>{message}</p>}
    </form>
  );
}
