import { logger } from './_core/logger';

export type ChallengeProvider = 'turnstile' | 'recaptcha';

export interface ChallengeVerificationResult {
  success: boolean;
  provider: ChallengeProvider | 'none';
  required: boolean;
  enforced: boolean;
  action?: string;
  message?: string;
  score?: number | null;
}

function getConfiguredProvider(): ChallengeProvider | 'none' {
  if (process.env.TURNSTILE_SECRET_KEY) {
    return 'turnstile';
  }
  if (process.env.RECAPTCHA_SECRET_KEY) {
    return 'recaptcha';
  }
  return 'none';
}

export function getChallengeConfiguration() {
  const provider = getConfiguredProvider();
  const siteKey = process.env.TURNSTILE_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || null;
  return {
    provider,
    configured: provider !== 'none',
    publicSearchRequired: process.env.PUBLIC_SEARCH_CHALLENGE_REQUIRED === 'true',
    publicVerificationRequired: process.env.PUBLIC_VERIFICATION_CHALLENGE_REQUIRED === 'true',
    siteKeyConfigured: Boolean(siteKey),
    siteKey,
  };
}

async function verifyTurnstile(token: string, remoteIp?: string): Promise<ChallengeVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return {
      success: false,
      provider: 'turnstile',
      required: false,
      enforced: false,
      message: 'Turnstile is not configured',
    };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    body.append('remoteip', remoteIp);
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await response.json() as {
      success?: boolean;
      action?: string;
      'error-codes'?: string[];
    };

    return {
      success: Boolean(data.success),
      provider: 'turnstile',
      required: true,
      enforced: true,
      action: data.action,
      message: data.success ? 'Challenge verified' : (data['error-codes'] || []).join(', ') || 'Challenge verification failed',
      score: null,
    };
  } catch (error) {
    logger.warn({ error }, 'Turnstile verification failed');
    return {
      success: false,
      provider: 'turnstile',
      required: true,
      enforced: true,
      message: error instanceof Error ? error.message : 'Challenge verification failed',
      score: null,
    };
  }
}

async function verifyRecaptcha(token: string, remoteIp?: string): Promise<ChallengeVerificationResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return {
      success: false,
      provider: 'recaptcha',
      required: false,
      enforced: false,
      message: 'reCAPTCHA is not configured',
    };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    body.append('remoteip', remoteIp);
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await response.json() as {
      success?: boolean;
      action?: string;
      score?: number;
      'error-codes'?: string[];
    };

    return {
      success: Boolean(data.success),
      provider: 'recaptcha',
      required: true,
      enforced: true,
      action: data.action,
      message: data.success ? 'Challenge verified' : (data['error-codes'] || []).join(', ') || 'Challenge verification failed',
      score: data.score ?? null,
    };
  } catch (error) {
    logger.warn({ error }, 'reCAPTCHA verification failed');
    return {
      success: false,
      provider: 'recaptcha',
      required: true,
      enforced: true,
      message: error instanceof Error ? error.message : 'Challenge verification failed',
      score: null,
    };
  }
}

export async function verifyChallengeToken(params: {
  token?: string;
  remoteIp?: string;
  required?: boolean;
}): Promise<ChallengeVerificationResult> {
  const config = getChallengeConfiguration();
  const required = Boolean(params.required);

  if (!required) {
    return {
      success: true,
      provider: config.provider,
      required: false,
      enforced: false,
      message: 'Challenge not required for this route',
      score: null,
    };
  }

  if (!params.token) {
    return {
      success: false,
      provider: config.provider,
      required: true,
      enforced: true,
      message: 'Challenge token is required',
      score: null,
    };
  }

  if (config.provider === 'turnstile') {
    return verifyTurnstile(params.token, params.remoteIp);
  }

  if (config.provider === 'recaptcha') {
    return verifyRecaptcha(params.token, params.remoteIp);
  }

  return {
    success: false,
    provider: 'none',
    required: true,
    enforced: true,
    message: 'No challenge provider is configured',
    score: null,
  };
}
