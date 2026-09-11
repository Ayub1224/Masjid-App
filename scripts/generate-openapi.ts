import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { mosqueDetailsSchema } from '../lib/mosque-details.ts';
import {
  commandSchema,
  credentials,
  registration,
  fileRequest,
} from '../lib/server/validation.ts';
const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
});
const str = { type: 'string' };
const paths: Record<string, unknown> = {};
function add(
  path: string,
  method: string,
  summary: string,
  body?: unknown,
  options: {
    public?: boolean;
    status?: number;
    response?: unknown;
    parameters?: unknown[];
    description?: string;
  } = {},
) {
  paths[`/api/backend/${path}`] = {
    ...(paths[`/api/backend/${path}`] as object),
    [method]: {
      operationId: path.replaceAll('/', '_') + '_' + method,
      summary,
      description: options.description,
      security: options.public ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      ...(body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: body } },
            },
          }
        : {}),
      ...(options.parameters ? { parameters: options.parameters } : {}),
      responses: {
        [options.status ?? 200]: {
          description: 'Success',
          content: {
            'application/json': {
              schema: options.response ?? object({ ok: { type: 'boolean' } }),
            },
          },
        },
        ...Object.fromEntries(
          [400, 401, 403, 404, 409, 413, 415, 429, 503].map((code) => [
            code,
            {
              description: (
                {
                  400: 'Invalid input or state',
                  401: 'Sign-in required or credentials rejected',
                  403: 'Permission, MFA or origin rejected',
                  404: 'Not found',
                  409: 'Duplicate or idempotency conflict',
                  413: 'Body too large',
                  415: 'Unsupported content type',
                  429: 'Rate limited',
                  503: 'Configuration or service unavailable',
                } as Record<number, string>
              )[code],
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          ]),
        ),
      },
    },
  };
}
add('mosque', 'get', 'Read mosque details', undefined, { public: true });
add('mosque', 'post', 'Save mosque details', jsonSchema(mosqueDetailsSchema));

add('settings', 'get', 'Public UI configuration', undefined, {
  public: true,
  response: object({ demo: { type: 'boolean' }, turnstileSiteKey: str }),
});
add('public', 'get', 'Published news and mosque prayer timetable', undefined, {
  public: true,
  response: object({
    prayers: {
      type: 'array',
      items: object({ name: str, adhan: str, jamaat: str }),
    },
    news: {
      type: 'array',
      items: object({
        id: str,
        title: str,
        body: str,
        hindi_title: str,
        hindi_body: str,
        event_on: str,
        image_url: { type: ['string', 'null'] },
      }),
    },
  }),
});
add(
  'auth/login',
  'post',
  'Sign in using email or phone and a six-digit PIN',
  jsonSchema(credentials),
  {
    public: true,
    description:
      'Requires Turnstile and a configured login gate. At most five attempts per account per 15 minutes across email and phone aliases. Returns secure HttpOnly cookies; no tokens in the JSON body.',
  },
);
add(
  'auth/register',
  'post',
  'Create an invited account and send email confirmation',
  jsonSchema(registration),
  { public: true, status: 202, response: object({ message: str }) },
);
add('auth/refresh', 'post', 'Rotate the refresh session', object({}), {
  public: true,
  description:
    'Requires the refresh cookie and trusted Origin. Remembered sessions last at most 14 days between refreshes, subject to Supabase session policy.',
});
add(
  'auth/recover',
  'post',
  'Request an email recovery link',
  jsonSchema(
    z.strictObject({
      email: z.email().max(254),
      captchaToken: z.string().min(1).max(2048),
    }),
  ),
  { public: true, status: 202, response: object({ message: str }) },
);
add(
  'auth/confirm',
  'post',
  'Exchange a signup or recovery email link',
  jsonSchema(
    z.strictObject({
      tokenHash: z.string().min(32).max(256),
      type: z.enum(['signup', 'recovery']),
    }),
  ),
  { public: true },
);
add('auth/logout', 'post', 'Revoke sessions and clear cookies', object({}));
add(
  'auth/password',
  'post',
  'Change the account PIN',
  jsonSchema(
    z.strictObject({
      pin: z.string().regex(/^\d{6}$/),
      nonce: z.string().max(32).optional(),
    }),
  ),
  {
    description:
      'The legacy URL name is retained. Supabase secure password change / reauthentication must be enabled. PIN is transformed server-side with PIN_PEPPER.',
  },
);
add('auth/mfa', 'get', 'List authenticator factors', undefined, {
  response: object({
    totp: {
      type: 'array',
      items: object({ id: str, status: str, friendly_name: str }),
    },
  }),
});
add(
  'auth/mfa/enroll',
  'post',
  'Enroll an administrator authenticator',
  object({}),
  {
    response: object({
      id: str,
      type: str,
      totp: object({ uri: str, qr_code: str, secret: str }),
    }),
  },
);
add(
  'auth/mfa/verify',
  'post',
  'Verify an authenticator code and upgrade session',
  jsonSchema(
    z.strictObject({ factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) }),
  ),
);
add(
  'me',
  'get',
  'Current verified identity, profile, permissions and assurance level',
  undefined,
  {
    response: object({
      userId: str,
      aal: str,
      profile: {
        type: ['object', 'null'],
        properties: {
          id: str,
          name: str,
          email: str,
          phone: str,
          address: str,
          role: str,
          active: { type: 'boolean' },
          permissions: { type: 'array', items: str },
        },
      },
    }),
  },
);
const tables = [
  'mosque_profiles',
  'mosque_payments',
  'mosque_expenses',
  'mosque_balance_checks',
  'mosque_prayers',
  'mosque_news',
  'mosque_receiving',
];
add(
  'payment-names',
  'get',
  'Contributor names for authorized payment review',
  undefined,
  {
    response: object({
      names: { type: 'object', additionalProperties: { type: 'string' } },
    }),
    description:
      'Requires MFA and verify, record or reports permission. Returns names only for contributors with payment records; no emails, phone numbers or addresses.',
  },
);
add('activity', 'get', 'Latest 50 permitted audit events', undefined, {
  response: object({
    activity: {
      type: 'array',
      items: object({ action: str, target: str, created_at: str }),
    },
  }),
  description:
    'Administrators see their own actions. The owner can read all operational activity. Requires MFA and an operational permission.',
});
const page = {
  name: 'page',
  in: 'query',
  schema: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
  description:
    'Zero-based page, 50 rows. Continue until fewer than 50 rows are returned.',
};
add('records', 'get', 'Read records allowed by row-level security', undefined, {
  parameters: [
    {
      name: 'table',
      in: 'query',
      required: true,
      schema: { type: 'string', enum: tables },
    },
    page,
  ],
  response: object({
    records: { type: 'array', items: { type: 'object' } },
    page: { type: 'integer' },
  }),
  description:
    'Members see only their own payments and profile. Posted expenses are shared; drafts and private member records require permissions. Monetary fields use integer INR paise. Dates use Asia/Kolkata calendar dates.',
});
add(
  'invitations',
  'get',
  'List permitted invitation metadata, without tokens',
  undefined,
  {
    parameters: [page],
    response: object({
      invitations: { type: 'array', items: { type: 'object' } },
      page: { type: 'integer' },
    }),
  },
);
add(
  'finances',
  'get',
  'Ledger totals and monthly aggregate movements',
  undefined,
  {
    response: object({
      balance: object({
        bankPaise: { type: 'integer' },
        cashPaise: { type: 'integer' },
      }),
      months: {
        type: 'array',
        items: object({
          month: str,
          receipts: { type: 'integer' },
          expenses: { type: 'integer' },
          adjustments: { type: 'integer' },
        }),
      },
    }),
  },
);
add(
  'command',
  'post',
  'Execute a validated, authorized CRUD or financial command',
  { $ref: '#/components/schemas/Command' },
  {
    status: 201,
    parameters: [
      {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    ],
    response: object({
      id: { type: 'string', format: 'uuid' },
      invitationUrl: str,
    }),
    description:
      'Use the type discriminator to select an operation. Repeat the identical body and idempotency key after an uncertain response. Changed input with the same key returns 409. Bulk review is atomic, max 25 distinct pending records, no self-review. Posted payments/expenses and ledger entries cannot be deleted: owner reversals preserve the audit trail. Member deletion means deactivation. Draft expenses and news may be deleted. Administrators require aal2 plus the relevant permission. Invitations expire after 48 hours.',
  },
);
add(
  'files/upload',
  'post',
  'Upload private payment evidence or receiving QR',
  undefined,
  {
    status: 201,
    parameters: [
      {
        name: 'bucket',
        in: 'query',
        required: true,
        schema: { type: 'string', enum: ['payment-evidence', 'mosque-qr'] },
      },
    ],
    response: object({ path: str }),
    description:
      'Raw PNG, JPEG or WebP bytes only, max 5 MiB. Upload ownership and bucket permissions are enforced by storage RLS.',
  },
);
const upload = (
  paths['/api/backend/files/upload'] as { post: Record<string, unknown> }
).post;
upload.requestBody = {
  required: true,
  content: Object.fromEntries(
    ['image/png', 'image/jpeg', 'image/webp'].map((mime) => [
      mime,
      { schema: { type: 'string', format: 'binary', maxLength: 5242880 } },
    ]),
  ),
};
add(
  'files/download',
  'post',
  'Get a private image download URL valid for 60 seconds',
  jsonSchema(fileRequest),
  {
    response: object({
      url: { type: 'string', format: 'uri' },
      expiresIn: { type: 'integer', const: 60 },
    }),
  },
);
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Mosque App API',
    version: '1.0.0',
    description:
      'Single-mosque Supabase backend. Browser mutations require the exact configured Origin. Session cookies are Secure, HttpOnly and SameSite=Lax. Financial writes are atomic and audited. This specification describes implemented contracts; live deployment must be configured and verified separately.',
  },
  servers: [{ url: '/' }],
  paths,
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Host-mosque-access',
      },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: str },
      },
      Command: jsonSchema(commandSchema),
    },
  },
};
writeFileSync('public/openapi.json', JSON.stringify(spec, null, 2) + '\n');
