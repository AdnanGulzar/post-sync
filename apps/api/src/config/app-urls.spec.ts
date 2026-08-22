import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_ADMIN_APP_URL, DEFAULT_USER_APP_URL, adminAppUrl, userAppUrl } from './app-urls';

/** Reads the `server.port` a Vite app actually listens on. */
function vitePort(app: 'user' | 'admin'): number {
  const config = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'apps', app, 'vite.config.mts'),
    'utf8',
  );
  const match = config.match(/server:\s*\{[^}]*port:\s*(\d+)/s);
  if (!match?.[1]) throw new Error(`No server.port found in apps/${app}/vite.config.mts`);
  return Number(match[1]);
}

describe('app URL defaults', () => {
  const saved = { user: process.env.USER_APP_URL, admin: process.env.ADMIN_APP_URL };

  beforeEach(() => {
    delete process.env.USER_APP_URL;
    delete process.env.ADMIN_APP_URL;
  });

  afterAll(() => {
    if (saved.user === undefined) delete process.env.USER_APP_URL;
    else process.env.USER_APP_URL = saved.user;
    if (saved.admin === undefined) delete process.env.ADMIN_APP_URL;
    else process.env.ADMIN_APP_URL = saved.admin;
  });

  it('defaults to the port the user app actually serves on', () => {
    // These defaults feed CORS. They previously pointed at :4200 while Vite
    // served :4220, so a fresh checkout got CORS-blocked frontends.
    expect(DEFAULT_USER_APP_URL).toBe(`http://localhost:${vitePort('user')}`);
  });

  it('defaults to the port the admin app actually serves on', () => {
    expect(DEFAULT_ADMIN_APP_URL).toBe(`http://localhost:${vitePort('admin')}`);
  });

  it('prefers the environment when set', () => {
    process.env.USER_APP_URL = 'https://app.example.com';
    process.env.ADMIN_APP_URL = 'https://admin.example.com';
    expect(userAppUrl()).toBe('https://app.example.com');
    expect(adminAppUrl()).toBe('https://admin.example.com');
  });

  it('falls back to the dev default when unset', () => {
    expect(userAppUrl()).toBe(DEFAULT_USER_APP_URL);
    expect(adminAppUrl()).toBe(DEFAULT_ADMIN_APP_URL);
  });
});
