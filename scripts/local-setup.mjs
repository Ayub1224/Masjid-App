import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env.docker')) {
  console.log('Existing .env.docker preserved.');
} else {
  const secret = () => randomBytes(32).toString('hex');
  const password = secret();
  writeFileSync(
    '.env.docker',
    [
      'POSTGRES_USER=mosque',
      'POSTGRES_DB=mosque',
      `POSTGRES_PASSWORD=${password}`,
      `DATABASE_URL=postgresql://mosque:${password}@db:5432/mosque`,
      'APP_ORIGIN=http://localhost:3000',
      'SMTP_HOST=mail',
      'SMTP_PORT=1025',
      `PIN_PEPPER=${secret()}`,
      `LOGIN_GATE_SECRET=${secret()}`,
      `INVITATION_SECRET=${secret()}`,
      'BOOTSTRAP_EMAIL=aaayyub30@gmail.com',
      'UPLOAD_DIR=/app/local-data',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log(
    'Created private local Docker settings. No cloud credentials required.',
  );
}
