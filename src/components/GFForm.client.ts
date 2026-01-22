// src/components/GFForm.client.ts
import { submitJSON } from "@/lib/gf/api";

/* ======================================================
   DEBUG FLAG
====================================================== */

const GF_DEBUG = true;

const gfLog = (...a: any[]) => GF_DEBUG && console.log("[GFForm]", ...a);
const gfWarn = (...a: any[]) => GF_DEBUG && console.warn("[GFForm]", ...a);
const gfErr = (...a: any[]) => console.error("[GFForm]", ...a);

/** Some WP setups return the rendered HTML as a JSON-encoded string. */
function unwrapMaybeJSONString(raw: string): string {
  const s = raw?.trim();
  if (!s) return s;
  const looksJSONWrapped =
    s.startsWith('"') && s.endsWith('"') && /\\[nrt"\\/]/.test(s);
  if (!looksJSONWrapped) return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function findClosestForm(el: Element | null): HTMLFormElement | null {
  while (el) {
    if (el instanceof HTMLFormElement) return el;
    el = el.parentElement!;
  }
  return null;
}

function serializeForm(form: HTMLFormElement) {
  const fd = new FormData(form);
  const payload: Record<string, any> = {};
  for (const [k, v] of fd.entries()) {
    if (payload[k] !== undefined) {
      const prev = payload[k];
      payload[k] = Array.isArray(prev)
        ? [...(Array.isArray(prev) ? prev : [prev]), v]
        : [prev, v];
    } else {
      payload[k] = v;
    }
  }
  return payload;
}

function clearErrors(root: HTMLElement) {
  root.querySelectorAll(".gf-inline-error").forEach((n) => n.remove());
  root
    .querySelectorAll(".gfield_error, .gfield--error")
    .forEach((el) => el.classList.remove("gfield_error", "gfield--error"));
}

function showErrors(root: HTMLElement, errors: Record<string, string>) {
  gfWarn("Field errors:", errors);

  Object.entries(errors).forEach(([name, msg]) => {
    const input = root.querySelector<HTMLElement>(
      `[name="${CSS.escape(name)}"]`
    );
    const field = (input?.closest?.(".gfield") as HTMLElement) || null;
    const target = field || input || root;

    if (field) field.classList.add("gfield_error", "gfield--error");

    const div = document.createElement("div");
    div.className = "gf-inline-error";
    div.setAttribute("role", "alert");
    div.textContent = msg;
    target?.appendChild(div);
  });
}

/* ======================================================
   FETCH & RENDER
====================================================== */

async function fetchRenderInto(host: HTMLElement, formId: number) {
  const base = (host.dataset.wpBase || "").replace(/\/+$/, "");

  gfLog("Render start", { formId, base });

  if (!base) {
    gfErr("Missing wpBase on host", host);
    host.innerHTML = `<div class="gf-error">Missing WP base URL.</div>`;
    return;
  }

  const url = `${base}/wp-json/gf/v2/form/${formId}`;

  gfLog("Render fetch →", url);

  const res = await fetch(url, { credentials: "include" });

  gfLog("Render HTTP", res.status, res.headers.get("content-type"));

  if (!res.ok) {
    const t = await res.text();
    gfErr("Render failed:", res.status, t.slice(0, 300));
    throw new Error(`Render failed (${res.status})`);
  }

  const raw = await res.text();
  const html = unwrapMaybeJSONString(raw);

  gfLog("Render HTML length:", html?.length);

  if (!html || !html.includes("<form")) {
    gfErr("Invalid GF render HTML:", html?.slice(0, 300));
    throw new Error("Render returned no form markup");
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  host.innerHTML = "";
  host.appendChild(tpl.content.cloneNode(true));

  gfLog("Render injected successfully");
}

/* ======================================================
   SUBMIT
====================================================== */

function wireSubmit(host: HTMLElement) {
  if ((host as any)._gfSubmitBound) return;

  host.addEventListener(
    "submit",
    async (ev) => {
      const form = findClosestForm(ev.target as Element);
      if (!form) return;

      ev.preventDefault();

      const formId = Number(host.dataset.gfFormId || "0");
      const viaProxy = host.dataset.gfProxy === "1";
      const base = (host.dataset.wpBase || "").replace(/\/+$/, "");

      gfLog("Submit start", { formId, viaProxy, base });

      const payload = serializeForm(form);

      gfLog("Payload keys:", Object.keys(payload));

      try {
        const res = await submitJSON(formId, payload, { viaProxy, base });

        gfLog("Submit response:", res);

        if (!res.ok) {
          if (res.errors) showErrors(host, res.errors);
          throw new Error(res.message || "Submission failed");
        }

        if (res.redirectUrl) {
          gfLog("Redirect →", res.redirectUrl);
          window.location.assign(res.redirectUrl);
          return;
        }

        gfLog("Submission success");
      } catch (e) {
        gfErr("Submit exception:", e);
        throw e;
      }
    },
    { capture: true }
  );

  (host as any)._gfSubmitBound = true;
}

/* ======================================================
   INIT
====================================================== */

function runGFInitPass() {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>(".gf-host[data-gf-form-id]")
  );

  gfLog("Init pass — hosts:", hosts.length);

  hosts.forEach(async (host) => {
    const formId = Number(host.dataset.gfFormId || "0");
    const hasForm = !!host.querySelector("form");

    gfLog("Host", { formId, hasForm });

    if (!hasForm && formId > 0) {
      try {
        await fetchRenderInto(host, formId);
      } catch (e) {
        gfErr("Client render failed:", e);
        host.innerHTML =
          `<div class="gf-error">Form temporarily unavailable. Please try again later.</div>`;
        return;
      }
    }

    wireSubmit(host);
  });
}

/* ======================================================
   BOOT
====================================================== */

export default function initGFClient() {
  gfLog("initGFClient()");
  runGFInitPass();
}

document.addEventListener("astro:page-load", () => {
  gfLog("astro:page-load");
  runGFInitPass();
});
