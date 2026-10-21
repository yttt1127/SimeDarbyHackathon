import { describe, expect, it } from 'vitest';
import { checkOrigin, resolveRuntimeConfig } from '../apps/server/runtime';

describe('deployment runtime', () => {
  it('validates PORT and preserves loopback development origins', () => {
    const config = resolveRuntimeConfig({ PORT: '4317' });
    expect(config.port).toBe(4317);
    expect(config.host).toBe('127.0.0.1');
    expect(checkOrigin('http://localhost:4317', config)).toBe(true);
    expect(checkOrigin('http://127.0.0.1:5173', config)).toBe(true);
    expect(checkOrigin('https://other.example', config)).toBe(false);
    for (const PORT of ['0', '-1', '1.5', '65536', 'abc'])
      expect(() => resolveRuntimeConfig({ PORT })).toThrow('PORT');
  });
  it('normalizes exact HTTPS production origins and fails closed without operator setup', () => {
    const environment = { RENDER: 'true', PORT: '4701', RENDER_EXTERNAL_URL: 'https://liftflow.example.test/',
      LIFTFLOW_PUBLIC_ORIGIN: 'https://demo.example.test/path/', LIFTFLOW_OPERATOR_PASSWORD: 'example-only-long-test-passphrase' };
    const config = resolveRuntimeConfig(environment);
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(4701);
    expect(checkOrigin('https://liftflow.example.test', config)).toBe(true);
    expect(checkOrigin('https://demo.example.test', config)).toBe(true);
    expect(checkOrigin('http://localhost:4701', config)).toBe(false);
    expect(checkOrigin('https://evil.example.test', config)).toBe(false);
    expect(checkOrigin('https://liftflow.example.test.evil', config)).toBe(false);
    expect(checkOrigin('https://liftflow.example.test/', config)).toBe(false);
    expect(() => resolveRuntimeConfig({ ...environment, LIFTFLOW_OPERATOR_PASSWORD: '' })).toThrow('LIFTFLOW_OPERATOR_PASSWORD');
    expect(() => resolveRuntimeConfig({ ...environment, RENDER_EXTERNAL_URL: 'http://liftflow.example.test' })).toThrow('HTTPS');
    expect(() => resolveRuntimeConfig({ RENDER: 'true', LIFTFLOW_OPERATOR_PASSWORD: environment.LIFTFLOW_OPERATOR_PASSWORD })).toThrow('RENDER_EXTERNAL_URL');
  });
});
