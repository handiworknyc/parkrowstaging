const EDGEWISE_GRAPHQL_URL = 'https://api.edgewise.io/graphql';

const EDGEWISE_CREATE_LEAD_MUTATION = `
  mutation CreateLead($input: CreateLeadInput!) {
    createLead(input: $input) {
      id
    }
  }
`;

type SubmissionFields = Record<string, unknown>;

type SubmitArgs = {
  formId: number | string;
  fields: SubmissionFields;
};

export type ContactSubmitResult = {
  body: string;
  contentType: string;
  status: number;
};

function logResponse(
  service: string,
  result: {
    body: string;
    contentType?: string;
    status: number;
  }
) {
  console.info(`[contact submit] ${service} response`, {
    body: result.body,
    contentType: result.contentType || 'application/json',
    status: result.status,
  });
}

function getEnv(name: string): string {
  const ime =
    (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  const pe =
    (typeof process !== 'undefined' && (process as any).env) || {};

  return String(pe[name] ?? ime[name] ?? '').trim();
}

function toBasicHeader(value?: string): string | null {
  if (!value) return null;
  if (value.startsWith('Basic ')) return value;

  return `Basic ${Buffer.from(value, 'utf8').toString('base64')}`;
}

function getWpBase(): string {
  const gql = getEnv('WORDPRESS_API_URL');
  const fromGql = gql ? gql.replace(/\/graphql\/?$/i, '') : '';

  return (
    getEnv('WP_BASE_URL') ||
    getEnv('PUBLIC_WP_BASE_URL') ||
    fromGql ||
    ''
  ).replace(/\/+$/, '');
}

function getEdgewiseToken(): string {
  return (
    getEnv('EDGEWISE_API_TOKEN') ||
    getEnv('EDGEWISE_TOKEN') ||
    getEnv('EDGEWISE')
  );
}

function getEdgewiseProjectId(): string {
  return getEnv('EDGEWISE_PROJECT_ID');
}

function readField(fields: SubmissionFields, key: string): string {
  const value = fields[key];

  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function readCheckbox(fields: SubmissionFields, key: string): boolean {
  const direct = fields[key];

  if (Array.isArray(direct)) {
    return direct.length > 0;
  }

  if (typeof direct === 'string') {
    return direct.trim().length > 0;
  }

  return Object.entries(fields).some(([fieldKey, value]) => {
    if (!fieldKey.startsWith(`${key}.`)) return false;

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return String(value ?? '').trim().length > 0;
  });
}

function readYesNo(fields: SubmissionFields, key: string): boolean | undefined {
  const value = readField(fields, key).toLowerCase();

  if (value === 'yes') return true;
  if (value === 'no') return false;

  return undefined;
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === 'object') return Object.keys(item).length > 0;
      return true;
    })
  ) as Partial<T>;
}

function buildEdgewiseInput(fields: SubmissionFields) {
  const firstName = readField(fields, 'input_1');
  const lastName = readField(fields, 'input_3');
  const email = readField(fields, 'input_4');
  const phone = readField(fields, 'input_6');
  const source = readField(fields, 'input_10');
  const isAgent = readYesNo(fields, 'input_11');
  const rawIsRepresented = readYesNo(fields, 'input_12');
  const address = readField(fields, 'input_16');
  const city = readField(fields, 'input_14');
  const state = readField(fields, 'input_17');
  const postalCode = readField(fields, 'input_15');
  const edgewiseAddress = compact({
    thoroughfare: address,
    locality: city,
    administrativeArea: state,
    postalCode,
  });

  const isRepresented =
    isAgent === true && rawIsRepresented === true
      ? false
      : rawIsRepresented;

  return compact({
    projectId: getEdgewiseProjectId(),
    name: [firstName, lastName].filter(Boolean).join(' '),
    email,
    phone,
    address: edgewiseAddress,
    source: source || undefined,
    isAgent,
    isRepresented,
    subscribed: readCheckbox(fields, 'input_13'),
  });
}

function buildGravityFields(fields: SubmissionFields): SubmissionFields {
  const next = { ...fields };

  // The live WordPress Gravity Form still validates field 10 against its old
  // choice set. Keep the user's selection for Edgewise, but omit it from the
  // Gravity submission until the WP form is updated to match.
  delete next.input_10;

  return next;
}

async function submitToGravity({
  formId,
  fields,
}: SubmitArgs): Promise<ContactSubmitResult> {
  const wpBase = getWpBase();

  if (!wpBase) {
    const result = {
      body: JSON.stringify({
        success: false,
        message: 'Missing WP base URL',
      }),
      contentType: 'application/json',
      status: 500,
    };

    logResponse('gravity', result);
    return result;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const auth = toBasicHeader(getEnv('WP_AUTH_BASIC'));
  if (auth) {
    headers.Authorization = auth;
  }

  const payload = {
    form_id: formId,
    fields,
    ...fields,
  };

  try {
    const response = await fetch(
      `${wpBase}/wp-json/custom-gf/v1/submit`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store',
      }
    );

    const result = {
      body: await response.text(),
      contentType:
        response.headers.get('content-type') || 'application/json',
      status: response.status,
    };

    logResponse('gravity', result);
    return result;
  } catch (error) {
    console.error('[contact submit] gravity request failed', error);

    const result = {
      body: JSON.stringify({
        success: false,
        message: 'Proxy request failed',
      }),
      contentType: 'application/json',
      status: 500,
    };

    logResponse('gravity', result);
    return result;
  }
}

async function submitToEdgewise({
  fields,
}: SubmitArgs): Promise<void> {
  const token = getEdgewiseToken();
  const input = buildEdgewiseInput(fields);

  if (!token) {
    console.warn('[contact submit] edgewise skipped: missing token');
    return;
  }

  if (!input.projectId) {
    console.warn(
      '[contact submit] edgewise skipped: missing EDGEWISE_PROJECT_ID'
    );
    return;
  }

  if (!input.name || !input.email) {
    console.warn(
      '[contact submit] edgewise skipped: missing required contact fields'
    );
    return;
  }

  try {
    const response = await fetch(EDGEWISE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: EDGEWISE_CREATE_LEAD_MUTATION,
        variables: { input },
      }),
      cache: 'no-store',
    });

    const text = await response.text();
    logResponse('edgewise', {
      body: text,
      contentType: response.headers.get('content-type') || 'application/json',
      status: response.status,
    });

    let data: any = null;

    try {
      data = JSON.parse(text);
    } catch {
      console.error(
        '[contact submit] edgewise returned non-JSON response',
        text.slice(0, 300)
      );
      return;
    }

    if (!response.ok || data?.errors?.length) {
      console.error('[contact submit] edgewise GraphQL failed', {
        status: response.status,
        errors: data?.errors,
      });
      return;
    }

    if (!data?.data?.createLead?.id) {
      console.error(
        '[contact submit] edgewise GraphQL returned no lead id',
        data
      );
      return;
    }

    console.info('[contact submit] edgewise lead created', {
      id: data.data.createLead.id,
    });
  } catch (error) {
    console.error('[contact submit] edgewise request failed', error);
  }
}

function gravitySubmissionSucceeded(result: ContactSubmitResult): boolean {
  if (result.status < 200 || result.status >= 300) {
    return false;
  }

  try {
    const data = JSON.parse(result.body);

    if (data && typeof data === 'object') {
      if (data.success === false) return false;
      if (data.is_valid === false) return false;

      if (
        data.validation_messages &&
        typeof data.validation_messages === 'object' &&
        Object.keys(data.validation_messages).length > 0
      ) {
        return false;
      }

      if (
        typeof data.confirmation_message === 'string' &&
        data.confirmation_message.trim().length > 0
      ) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return true;
}

export async function submitContact(
  body: unknown
): Promise<ContactSubmitResult> {
  if (!body || typeof body !== 'object') {
    return {
      body: JSON.stringify({
        success: false,
        message: 'Invalid request body.',
      }),
      contentType: 'application/json',
      status: 400,
    };
  }

  const { form_id, fields } = body as {
    fields?: unknown;
    form_id?: number | string;
  };

  if (
    !form_id ||
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields)
  ) {
    return {
      body: JSON.stringify({
        success: false,
        message: 'Missing form_id or fields.',
      }),
      contentType: 'application/json',
      status: 400,
    };
  }

  const normalizedFields = {
    ...(fields as SubmissionFields),
  };
  const gravityFields = buildGravityFields(normalizedFields);

  const gravityResult = await submitToGravity({
    formId: form_id,
    fields: gravityFields,
  });

  const gravitySucceeded = gravitySubmissionSucceeded(gravityResult);

  console.info('[contact submit] gravity submission result', {
    formId: form_id,
    gravitySucceeded,
  });

  if (gravitySucceeded) {
    await submitToEdgewise({
      formId: form_id,
      fields: normalizedFields,
    });
  }

  return gravityResult;
}
