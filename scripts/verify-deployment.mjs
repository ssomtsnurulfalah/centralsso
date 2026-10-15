// Read-only smoke test: never logs in, sends credentials, or mutates native data.
const checks = [];
try {
  const origin = process.argv[2];
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('origin');
  const request = pathname => fetch(origin + pathname, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const login = await request('/login');
  if ([401, 403].includes(login.status)) throw new Error('deployment_protected');
  if ([301, 302, 303, 307, 308].includes(login.status)) throw new Error('deployment_redirected');
  const html = await login.text();
  const csp = login.headers.get('content-security-policy') || '';
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  checks.push({ name: 'login', http_status: login.status, passed: login.status === 200 && /<form\b/i.test(html) });
  checks.push({ name: 'CSP_nonce', passed: !!nonce && scripts.length > 0 && scripts.every(s => s[1].includes('nonce="' + nonce + '"')) && !/unsafe-inline|unsafe-eval/.test(csp) });
  checks.push({ name: 'security_headers', passed: login.headers.get('x-content-type-options') === 'nosniff' && login.headers.get('x-frame-options') === 'DENY' && /no-store/.test(login.headers.get('cache-control') || '') });
  const admin = await request('/admin');
  const location = new URL(admin.headers.get('location') || '/', origin);
  checks.push({ name: 'protected_admin', http_status: admin.status, passed: [302, 303, 307, 308].includes(admin.status) && location.origin === origin && location.pathname === '/login' });
  const method = await request('/api/panel');
  checks.push({ name: 'panel_GET_denied', http_status: method.status, passed: method.status === 405 });
  const success = checks.every(c => c.passed);
  console.log(JSON.stringify({ success, scope: 'frontend_read_only', backend_verified: false, checks }, null, 2));
  if (!success) process.exitCode = 1;
} catch (e) {
  const reason = e.message === 'deployment_protected' ? 'DEPLOYMENT_PROTECTED' : e.message === 'deployment_redirected' ? 'DEPLOYMENT_REDIRECTED' : 'INVALID_ORIGIN_OR_NETWORK';
  console.log(JSON.stringify({ success: false, scope: 'frontend_read_only', backend_verified: false, reason, checks }, null, 2));
  process.exitCode = 1;
}
