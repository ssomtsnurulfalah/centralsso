import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDeploymentEnvironment } from '../scripts/lib/deployment-config.mjs';
const valid = { SSO_GAS_URL: 'https://script.google.com/macros/s/' + 'A'.repeat(30) + '/exec', SSO_GATEWAY_KEY_ID: 'gateway_v1', SSO_GATEWAY_SECRET: 'ab'.repeat(32), SSO_APP_ORIGIN: 'https://sso.example.org' };
test('valid deployment config does not imply native verification', () => {
  const r = checkDeploymentEnvironment(valid);
  assert.equal(r.configuration_ready, true);
  assert.equal(r.native_google_verified, false);
});
test('missing configuration blocks deployment', () => assert.equal(checkDeploymentEnvironment({}).configuration_ready, false));
test('reject dev, placeholder, fixture and credential-bearing GAS URLs', () => {
  for (const url of [valid.SSO_GAS_URL.replace('/exec', '/dev'), 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec', 'https://script.google.com/macros/s/central_sso_stage7_fixture/exec', valid.SSO_GAS_URL.replace('https://', 'https://u:p@'), valid.SSO_GAS_URL + '?x=1', valid.SSO_GAS_URL.replace('script.google.com', 'evil.example')])
    assert.equal(checkDeploymentEnvironment({ ...valid, SSO_GAS_URL: url }).configuration_ready, false);
});
test('reject unsafe or non-exact production origins', () => {
  for (const origin of ['http://sso.example.org', 'https://sso.example.org/', 'https://sso.example.org/path', 'https://localhost', 'https://sso.example.org?x=1', 'https://u:p@sso.example.org'])
    assert.equal(checkDeploymentEnvironment({ ...valid, SSO_APP_ORIGIN: origin }).configuration_ready, false);
});
test('reject public configuration and test preloads', () => {
  for (const patch of [{ NEXT_PUBLIC_SSO_GATEWAY_SECRET: 'sensitive' }, { SSO_TEST_FIXTURE: 'stage7-local-only' }, { NODE_OPTIONS: '--import fixture.mjs' }])
    assert.equal(checkDeploymentEnvironment({ ...valid, ...patch }).configuration_ready, false);
});
test('report never echoes secret or supplied invalid values', () => {
  const report = JSON.stringify(checkDeploymentEnvironment({ ...valid, SSO_GATEWAY_SECRET: 'DO_NOT_ECHO_SECRET', SSO_GAS_URL: 'DO_NOT_ECHO_URL' }));
  assert.doesNotMatch(report, /DO_NOT_ECHO/);
});
