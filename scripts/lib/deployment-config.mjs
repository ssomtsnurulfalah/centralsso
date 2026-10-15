export function checkDeploymentEnvironment(env) {
  const checks = [];
  const add = (name, valid) => checks.push({ name, status: valid ? 'PASS' : 'BLOCKED' });
  let gas, origin;
  try { gas = new URL(env.SSO_GAS_URL); } catch {}
  try { origin = new URL(env.SSO_APP_ORIGIN); } catch {}
  add('SSO_GAS_URL', !!gas && gas.protocol === 'https:' && gas.hostname === 'script.google.com' && !gas.port && !gas.username && !gas.password && !gas.search && !gas.hash && /^\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(gas.pathname) && !/DEPLOYMENT_ID|fixture/i.test(gas.pathname));
  add('SSO_GATEWAY_KEY_ID', /^[A-Za-z0-9_-]{1,64}$/.test(env.SSO_GATEWAY_KEY_ID || ''));
  add('SSO_GATEWAY_SECRET', /^[a-f0-9]{64}$/.test(env.SSO_GATEWAY_SECRET || '') && new Set(env.SSO_GATEWAY_SECRET).size > 1);
  add('SSO_APP_ORIGIN', !!origin && origin.protocol === 'https:' && origin.origin === env.SSO_APP_ORIGIN && !origin.username && !origin.password && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
  add('NO_PUBLIC_SSO_CONFIG', !Object.keys(env).some(k => k.startsWith('NEXT_PUBLIC_SSO_')));
  add('NO_TEST_PRELOAD', !env.SSO_TEST_FIXTURE && !env.NODE_OPTIONS);
  return { configuration_ready: checks.every(c => c.status === 'PASS'), native_google_verified: false, checks };
}
