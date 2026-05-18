import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/shared/api/firebase/index.ts'), 'utf8');

describe('Política de inicialização do App Check no frontend', () => {
  it('usa reCAPTCHA v3 condicionado à site key pública', () => {
    expect(source).toContain('ReCaptchaV3Provider');
    expect(source).toContain('VITE_RECAPTCHA_SITE_KEY');
    expect(source).toContain('new ReCaptchaV3Provider(_siteKey)');
    expect(source).toMatch(/if \(_siteKey && !_isEmulator && !_isTest\)/);
  });

  it('pula App Check em testes e no emulator sem exigir token real', () => {
    expect(source).toContain("VITE_USE_EMULATOR === 'true'");
    expect(source).toContain("import.meta.env.MODE === 'test'");
    expect(source).toContain("import.meta.env.VITEST === 'true'");
  });

  it('suporta debug token somente via variável de ambiente dedicada', () => {
    expect(source).toContain('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
    expect(source).toContain('FIREBASE_APPCHECK_DEBUG_TOKEN');
    expect(source).not.toMatch(/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*['"][^'"]+['"]/);
  });
});
