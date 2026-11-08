import { createCaptchaVerifier } from '../captcha/verify.js';
export { CaptchaVerifyError, createNoneVerifier, createTurnstileVerifier } from '../captcha/verify.js';

export function createCapVerifier(options = {}) {
  return createCaptchaVerifier({ provider: 'cap', ...options });
}
