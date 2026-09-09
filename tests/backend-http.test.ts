import { describe, it, expect, vi, afterEach } from 'vitest';
import { boundedBody, sameOrigin, imageType, json } from '../lib/server/http';
import { config, sessionCookies } from '../lib/server/supabase';
import { commandSchema } from '../lib/server/validation';
import { POST, GET } from '../app/api/backend/[...path]/route';
import type { Session } from '@supabase/supabase-js';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('API trust boundaries', () => {
  it('fails closed without configuration before touching external services', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await GET(
      new Request('https://mosque.example/api/backend/me'),
    );
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects cross-origin cookie mutations before authentication', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('APP_ORIGIN', 'https://mosque.example');
    const response = await POST(
      new Request('https://mosque.example/api/backend/command', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          cookie: '__Host-mosque-access=stolen',
        },
      }),
    );
    expect(response.status).toBe(403);
  });
  it('rejects missing Origin and does not trust forwarded host', () => {
    expect(() =>
      sameOrigin(
        new Request('https://mosque.example', {
          headers: { 'x-forwarded-host': 'mosque.example' },
        }),
        'https://mosque.example',
      ),
    ).toThrow();
  });
  it('rejects oversized streams even without a Content-Length', async () => {
    await expect(
      boundedBody(
        new Request('https://mosque.example', {
          method: 'POST',
          body: '123456',
        }),
        5,
      ),
    ).rejects.toThrow('BODY_TOO_LARGE');
  });
  it('rejects SVG/HTML disguised as evidence and recognizes image signatures', () => {
    expect(() =>
      imageType(new TextEncoder().encode('<svg onload=alert(1)>')),
    ).toThrow();
    expect(
      imageType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))
        .extension,
    ).toBe('png');
  });
  it('rejects identity/role injection and fractional or negative money', () => {
    const cash = {
      type: 'cash',
      amountPaise: 100,
      date: '2026-01-01',
      memberId: '00000000-0000-4000-8000-000000000001',
      purpose: 'Donation',
    };
    expect(commandSchema.safeParse({ ...cash, actor: 'owner' }).success).toBe(
      false,
    );
    expect(commandSchema.safeParse({ ...cash, amountPaise: 1.5 }).success).toBe(
      false,
    );
    expect(commandSchema.safeParse({ ...cash, amountPaise: -1 }).success).toBe(
      false,
    );
  });
  it('refuses insecure or untrusted service URLs', () => {
    vi.stubEnv('SUPABASE_URL', 'http://attacker.test');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubEnv('APP_ORIGIN', 'https://mosque.example');
    expect(() => config()).toThrow();
  });
  it('uses noncacheable secure HttpOnly host cookies without exposing tokens as JSON', async () => {
    const response = sessionCookies(
      json({ ok: true }),
      {
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        expires_in: 3600,
      } as Session,
      true,
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    for (const c of response.headers.getSetCookie()) {
      expect(c).toContain('Secure');
      expect(c).toContain('HttpOnly');
      expect(c).toContain('SameSite=Lax');
      expect(c).not.toContain('Domain=');
    }
    expect(await response.text()).not.toContain('secret');
  });
});
