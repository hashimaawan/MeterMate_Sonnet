import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '4000'), 10),

  maxio: {
    apiKey: requireEnv('MAXIO_API_KEY'),
    siteSubdomain: requireEnv('MAXIO_SITE_SUBDOMAIN'),
    environment: optionalEnv('MAXIO_ENVIRONMENT', 'US') as 'US' | 'EU',
    defaultProductFamily: optionalEnv('MAXIO_DEFAULT_PRODUCT_FAMILY', 'metermate-consulting'),
  },

  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    digestChannel: optionalEnv('SLACK_DIGEST_CHANNEL', ''),
  },

  admin: {
    user: requireEnv('ADMIN_USER'),
    password: requireEnv('ADMIN_PASSWORD'),
  },

  session: {
    ttlMinutes: parseInt(optionalEnv('SESSION_TTL_MINUTES', '30'), 10),
  },

  demoMode: optionalEnv('DEMO_MODE', 'false') === 'true',
  digestCron: optionalEnv('DIGEST_CRON', '0 9 * * 1'),

  consultants: [
    {
      id: 'consultant-1',
      name: optionalEnv('CONSULTANT_1_NAME', 'Consultant One'),
      email: optionalEnv('CONSULTANT_1_EMAIL', ''),
    },
    {
      id: 'consultant-2',
      name: optionalEnv('CONSULTANT_2_NAME', 'Consultant Two'),
      email: optionalEnv('CONSULTANT_2_EMAIL', ''),
    },
  ] as Array<{ id: string; name: string; email: string }>,
} as const;
