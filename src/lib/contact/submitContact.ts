const EDGEWISE_GRAPHQL_URL = 'https://api.edgewise.io/graphql';

const EDGEWISE_CONTACT_PROJECT_MUTATION = `
  mutation ContactProject($input: ContactProjectInput!) {
    contactProject(input: $input) {
      id
      leadId
    }
  }
`;

const EDGEWISE_PROJECT_LEAD_SOURCES_QUERY = `
  query ProjectLeadSources($id: ID!) {
    project(id: $id) {
      id
      leadSources {
        id
        name
      }
    }
  }
`;

const EDGEWISE_LEAD_SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;

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

type EdgewiseSkipReason =
  | 'gravity_failed'
  | 'missing_contact_fields'
  | 'missing_project_id'
  | 'missing_token';

type EdgewiseFailureReason =
  | 'graphql_error'
  | 'no_contact_message_id'
  | 'non_json_response'
  | 'request_failed';

type EdgewiseDebugInfo = {
  attempted: boolean;
  contactMessageId?: string;
  enabled: boolean;
  errors?: Array<Record<string, unknown>>;
  errorMessage?: string;
  failureReason?: EdgewiseFailureReason;
  input: Record<string, unknown>;
  leadId?: string;
  populatedFieldKeys: string[];
  projectIdConfigured: boolean;
  responseSnippet?: string;
  responseStatus?: number;
  skippedReason?: EdgewiseSkipReason;
  success: boolean;
  tokenConfigured: boolean;
};

type EdgewiseLeadSource = {
  id: string;
  name: string;
};

const edgewiseLeadSourceCache = new Map<
  string,
  {
    expiresAt: number;
    sources: EdgewiseLeadSource[];
  }
>();

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

function isTruthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '').trim().toLowerCase()
  );
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

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasValue(item));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      hasValue(item)
    );
  }

  return true;
}

function getPopulatedFieldKeys(fields: SubmissionFields): string[] {
  return Object.entries(fields)
    .filter(([, value]) => hasValue(value))
    .map(([key]) => key)
    .sort();
}

function maskEmail(value: string): string {
  const [local = '', domain = ''] = value.split('@');
  const domainParts = domain.split('.');
  const domainName = domainParts.shift() || '';
  const suffix = domainParts.length ? `.${domainParts.join('.')}` : '';

  if (!local || !domainName) return '[present]';

  return `${local[0]}***@${domainName[0]}***${suffix}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (!digits) return '[present]';

  return `***${digits.slice(-4)}`;
}

function summarizeDebugString(value: string, path: string[]): string {
  const key = path[path.length - 1] || '';
  const joined = path.join('.');

  if (
    joined === 'metadata.workingWithAgent' ||
    key === 'countryCode' ||
    key === 'projectId' ||
    key === 'source' ||
    key === 'sourceId'
  ) {
    return value;
  }

  if (key === 'email') return maskEmail(value);
  if (key === 'phone') return maskPhone(value);

  return '[present]';
}

function sanitizeDebugValue(
  value: unknown,
  path: string[] = []
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugValue(item, path));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeDebugValue(item, [...path, key]),
      ])
    );
  }

  if (typeof value === 'string') {
    return summarizeDebugString(value, path);
  }

  return value;
}

function truncate(value: string, max = 700): string {
  const normalized = value.trim();

  if (normalized.length <= max) return normalized;

  return `${normalized.slice(0, max)}...`;
}

function serializeGraphqlErrors(
  value: unknown
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;

  return value.map((entry) => {
    const error =
      entry && typeof entry === 'object'
        ? (entry as Record<string, unknown>)
        : {};
    const extensions =
      error.extensions && typeof error.extensions === 'object'
        ? (error.extensions as Record<string, unknown>)
        : {};

    return compact({
      code:
        typeof extensions.code === 'string' ? extensions.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
      path: Array.isArray(error.path) ? error.path : undefined,
    });
  });
}

function buildEdgewiseDebugInfo(
  fields: SubmissionFields,
  input: Record<string, unknown>,
  options: {
    enabled: boolean;
    projectIdConfigured: boolean;
    tokenConfigured: boolean;
  }
): EdgewiseDebugInfo {
  return {
    attempted: false,
    enabled: options.enabled,
    input: sanitizeDebugValue(input) as Record<string, unknown>,
    populatedFieldKeys: getPopulatedFieldKeys(fields),
    projectIdConfigured: options.projectIdConfigured,
    success: false,
    tokenConfigured: options.tokenConfigured,
  };
}

function appendEdgewiseDebug(
  result: ContactSubmitResult,
  debug: EdgewiseDebugInfo | null
): ContactSubmitResult {
  if (!debug?.enabled) return result;

  try {
    const parsed = JSON.parse(result.body);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return result;
    }

    return {
      ...result,
      body: JSON.stringify({
        ...parsed,
        edgewise: debug,
      }),
    };
  } catch {
    return result;
  }
}

function normalizeEdgewiseSourceName(value: string): string {
  return value.trim().toLowerCase();
}

async function fetchEdgewiseLeadSources({
  projectId,
  token,
}: {
  projectId: string;
  token: string;
}): Promise<EdgewiseLeadSource[]> {
  const cached = edgewiseLeadSourceCache.get(projectId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.sources;
  }

  const response = await fetch(EDGEWISE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: EDGEWISE_PROJECT_LEAD_SOURCES_QUERY,
      variables: { id: projectId },
    }),
    cache: 'no-store',
  });

  const text = await response.text();
  let data: any = null;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Edgewise lead sources query returned non-JSON response');
  }

  if (!response.ok || data?.errors?.length) {
    throw new Error(
      `Edgewise lead sources query failed: ${truncate(text, 300)}`
    );
  }

  const sources = Array.isArray(data?.data?.project?.leadSources)
    ? data.data.project.leadSources
        .map((source: any) => ({
          id: String(source?.id ?? '').trim(),
          name: String(source?.name ?? '').trim(),
        }))
        .filter((source: EdgewiseLeadSource) => source.id && source.name)
    : [];

  edgewiseLeadSourceCache.set(projectId, {
    expiresAt: Date.now() + EDGEWISE_LEAD_SOURCE_CACHE_TTL_MS,
    sources,
  });

  return sources;
}

async function resolveEdgewiseSourceId({
  projectId,
  sourceLabel,
  token,
}: {
  projectId: string;
  sourceLabel: string;
  token: string;
}): Promise<string | undefined> {
  const envOverride = getEnv('EDGEWISE_SOURCE');

  if (envOverride) {
    return envOverride;
  }

  if (!projectId || !sourceLabel || !token) {
    return undefined;
  }

  const sources = await fetchEdgewiseLeadSources({ projectId, token });
  const normalized = normalizeEdgewiseSourceName(sourceLabel);
  const match = sources.find(
    (source) => normalizeEdgewiseSourceName(source.name) === normalized
  );

  return match?.id || undefined;
}

function buildEdgewiseInput(
  fields: SubmissionFields,
  options?: {
    sourceId?: string;
  }
) {
  const firstName = readField(fields, 'input_1');
  const lastName = readField(fields, 'input_3');
  const email = readField(fields, 'input_4');
  const phone = readField(fields, 'input_6');
  const isAgent = readYesNo(fields, 'input_11');
  const isRepresentedAnswer = readYesNo(fields, 'input_12');
  const company = readField(fields, 'input_19');
  const agentFirstName = readField(fields, 'input_20');
  const agentLastName = readField(fields, 'input_21');
  const address = readField(fields, 'input_16');
  const city = readField(fields, 'input_14');
  const state = readField(fields, 'input_17');
  const postalCode = readField(fields, 'input_15');
  const isRepresented = isAgent ? false : isRepresentedAnswer;
  const agentName = [agentFirstName, agentLastName].filter(Boolean).join(' ');
  const edgewiseAddress = compact({
    thoroughfare: address,
    locality: city,
    administrativeArea: state,
    postalCode,
  });
  const agent = compact({
    name:
      isAgent || isRepresented !== true || !agentName
        ? undefined
        : agentName,
  });

  return compact({
    projectId: getEdgewiseProjectId(),
    name: [firstName, lastName].filter(Boolean).join(' '),
    email,
    phone,
    address: edgewiseAddress,
    sourceId: options?.sourceId,
    company: company || undefined,
    agent,
    follow: readCheckbox(fields, 'input_13'),
    isAgent,
    isRepresented,
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
  debugEnabled,
  fields,
}: SubmitArgs & {
  debugEnabled?: boolean;
}): Promise<EdgewiseDebugInfo> {
  const token = getEdgewiseToken();
  const projectId = getEdgewiseProjectId();
  const sourceLabel = readField(fields, 'input_10');
  let sourceId: string | undefined;

  try {
    sourceId = await resolveEdgewiseSourceId({
      projectId,
      sourceLabel,
      token,
    });
  } catch (error) {
    console.warn('[contact submit] edgewise source lookup failed', {
      error,
      projectId,
      sourceLabel,
    });
  }

  const input = buildEdgewiseInput(fields, { sourceId });
  const debug = buildEdgewiseDebugInfo(fields, input, {
    enabled: !!debugEnabled,
    projectIdConfigured: !!input.projectId,
    tokenConfigured: !!token,
  });

  console.info('[contact submit] edgewise request summary', {
    input: debug.input,
    populatedFieldKeys: debug.populatedFieldKeys,
    projectIdConfigured: debug.projectIdConfigured,
    tokenConfigured: debug.tokenConfigured,
  });

  if (!token) {
    debug.skippedReason = 'missing_token';
    console.warn('[contact submit] edgewise skipped: missing token', debug);
    return debug;
  }

  if (!input.projectId) {
    debug.skippedReason = 'missing_project_id';
    console.warn(
      '[contact submit] edgewise skipped: missing EDGEWISE_PROJECT_ID',
      debug
    );
    return debug;
  }

  if (!input.name || !input.email) {
    debug.skippedReason = 'missing_contact_fields';
    console.warn(
      '[contact submit] edgewise skipped: missing required contact fields',
      debug
    );
    return debug;
  }

  try {
    debug.attempted = true;

    const response = await fetch(EDGEWISE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: EDGEWISE_CONTACT_PROJECT_MUTATION,
        variables: { input },
      }),
      cache: 'no-store',
    });

    const text = await response.text();
    debug.responseSnippet = truncate(text);
    debug.responseStatus = response.status;
    logResponse('edgewise', {
      body: text,
      contentType: response.headers.get('content-type') || 'application/json',
      status: response.status,
    });

    let data: any = null;

    try {
      data = JSON.parse(text);
    } catch {
      debug.failureReason = 'non_json_response';
      console.error(
        '[contact submit] edgewise returned non-JSON response',
        {
          responseSnippet: debug.responseSnippet,
          ...debug,
        }
      );
      return debug;
    }

    if (!response.ok || data?.errors?.length) {
      debug.errors = serializeGraphqlErrors(data?.errors);
      debug.failureReason = 'graphql_error';
      console.error('[contact submit] edgewise GraphQL failed', {
        debug,
        status: response.status,
        errors: data?.errors,
      });
      return debug;
    }

    if (!data?.data?.contactProject?.id) {
      debug.failureReason = 'no_contact_message_id';
      console.error(
        '[contact submit] edgewise GraphQL returned no contact message id',
        {
          data,
          debug,
        }
      );
      return debug;
    }

    debug.contactMessageId = data.data.contactProject.id;
    debug.leadId =
      typeof data.data.contactProject.leadId === 'string'
        ? data.data.contactProject.leadId
        : undefined;
    debug.success = true;
    console.info('[contact submit] edgewise contact project created', {
      debug,
      id: data.data.contactProject.id,
      leadId: data.data.contactProject.leadId,
    });
  } catch (error) {
    debug.errorMessage =
      error instanceof Error ? error.message : String(error);
    debug.failureReason = 'request_failed';
    console.error('[contact submit] edgewise request failed', {
      debug,
      error,
    });
  }

  return debug;
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

  const { edgewise_debug, form_id, fields } = body as {
    edgewise_debug?: unknown;
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
  const edgewiseDebugEnabled =
    isTruthy(edgewise_debug) ||
    isTruthy(getEnv('EDGEWISE_DEBUG')) ||
    isTruthy(getEnv('PUBLIC_EDGEWISE_DEBUG'));

  const gravityResult = await submitToGravity({
    formId: form_id,
    fields: gravityFields,
  });

  const gravitySucceeded = gravitySubmissionSucceeded(gravityResult);

  console.info('[contact submit] gravity submission result', {
    formId: form_id,
    gravitySucceeded,
  });

  let edgewiseDebug: EdgewiseDebugInfo | null = null;

  if (gravitySucceeded) {
    edgewiseDebug = await submitToEdgewise({
      debugEnabled: edgewiseDebugEnabled,
      formId: form_id,
      fields: normalizedFields,
    });
  } else if (edgewiseDebugEnabled) {
    edgewiseDebug = buildEdgewiseDebugInfo(
      normalizedFields,
      buildEdgewiseInput(normalizedFields),
      {
        enabled: true,
        projectIdConfigured: !!getEdgewiseProjectId(),
        tokenConfigured: !!getEdgewiseToken(),
      }
    );
    edgewiseDebug.skippedReason = 'gravity_failed';

    console.info(
      '[contact submit] edgewise skipped because gravity did not succeed',
      edgewiseDebug
    );
  }

  return appendEdgewiseDebug(gravityResult, edgewiseDebug);
}
