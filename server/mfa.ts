/**
 * Multi-Factor Authentication (MFA) System
 * TOTP, SMS OTP, WebAuthn, and backup codes
 */

import crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { secureNumericCode } from './security/random';

export interface MFAConfig {
  userId: number;
  enabled: boolean;
  methods: {
    totp: boolean;
    sms: boolean;
    webauthn: boolean;
  };
  totpSecret?: string;
  phone?: string;
  backupCodes?: string[];
  trustedDevices?: TrustedDevice[];
}

export interface TrustedDevice {
  id: string;
  name: string;
  fingerprint: string;
  lastUsed: Date;
  createdAt: Date;
}

export interface MFAVerification {
  userId: number;
  method: 'totp' | 'sms' | 'backup_code' | 'webauthn';
  code: string;
  deviceFingerprint?: string;
}

/**
 * MFA Service
 */
export class MFAService {
  private configs: Map<number, MFAConfig> = new Map();
  private pendingSMSCodes: Map<number, { code: string; expiresAt: Date }> = new Map();

  /**
   * Enable TOTP for user
   */
  async enableTOTP(userId: number, userName: string): Promise<{ secret: string; qrCode: string }> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `IDLR (${userName})`,
      issuer: 'IDLR Property Title System',
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    // Store secret (not yet enabled until verified)
    const config = this.getOrCreateConfig(userId);
    config.totpSecret = secret.base32;
    this.configs.set(userId, config);

    console.log(`[MFA] TOTP setup initiated for user ${userId}`);

    return {
      secret: secret.base32,
      qrCode,
    };
  }

  /**
   * Verify and enable TOTP
   */
  async verifyAndEnableTOTP(userId: number, code: string): Promise<boolean> {
    const config = this.configs.get(userId);

    if (!config || !config.totpSecret) {
      throw new Error('TOTP not initialized');
    }

    const verified = speakeasy.totp.verify({
      secret: config.totpSecret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 time steps before/after
    });

    if (verified) {
      config.enabled = true;
      config.methods.totp = true;
      this.configs.set(userId, config);

      console.log(`[MFA] TOTP enabled for user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Enable SMS MFA
   */
  async enableSMS(userId: number, phone: string): Promise<void> {
    const config = this.getOrCreateConfig(userId);
    config.phone = phone;
    config.methods.sms = true;
    config.enabled = true;
    this.configs.set(userId, config);

    console.log(`[MFA] SMS enabled for user ${userId}`);
  }

  /**
   * Send SMS OTP
   */
  async sendSMSOTP(userId: number): Promise<void> {
    const config = this.configs.get(userId);

    if (!config || !config.phone) {
      throw new Error('SMS MFA not configured');
    }

    // Generate 6-digit code
    const code = secureNumericCode(6);

    // Store with 5-minute expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    this.pendingSMSCodes.set(userId, { code, expiresAt });

    // Send SMS (mock - in production use Twilio)
    console.log(`[MFA] SMS OTP sent to user ${userId}: ${code}`);

    // In production:
    // await twilioClient.messages.create({
    //   to: config.phone,
    //   from: TWILIO_PHONE_NUMBER,
    //   body: `Your IDLR verification code is: ${code}. Valid for 5 minutes.`,
    // });
  }

  /**
   * Verify MFA code
   */
  async verify(verification: MFAVerification): Promise<boolean> {
    const config = this.configs.get(verification.userId);

    if (!config || !config.enabled) {
      throw new Error('MFA not enabled for user');
    }

    switch (verification.method) {
      case 'totp':
        return this.verifyTOTP(verification.userId, verification.code);

      case 'sms':
        return this.verifySMS(verification.userId, verification.code);

      case 'backup_code':
        return this.verifyBackupCode(verification.userId, verification.code);

      case 'webauthn':
        return this.verifyWebAuthn(verification.userId, verification.code);

      default:
        return false;
    }
  }

  /**
   * Verify TOTP code
   */
  private verifyTOTP(userId: number, code: string): boolean {
    const config = this.configs.get(userId);

    if (!config || !config.totpSecret) {
      return false;
    }

    return speakeasy.totp.verify({
      secret: config.totpSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });
  }

  /**
   * Verify SMS OTP
   */
  private verifySMS(userId: number, code: string): boolean {
    const pending = this.pendingSMSCodes.get(userId);

    if (!pending) {
      return false;
    }

    // Check expiration
    if (new Date() > pending.expiresAt) {
      this.pendingSMSCodes.delete(userId);
      return false;
    }

    // Verify code
    if (pending.code === code) {
      this.pendingSMSCodes.delete(userId);
      return true;
    }

    return false;
  }

  /**
   * Generate backup codes
   */
  async generateBackupCodes(userId: number): Promise<string[]> {
    const codes: string[] = [];

    // Generate 10 backup codes
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    // Store hashed versions
    const config = this.getOrCreateConfig(userId);
    config.backupCodes = codes.map(code => this.hashBackupCode(code));
    this.configs.set(userId, config);

    console.log(`[MFA] Generated backup codes for user ${userId}`);

    return codes;
  }

  /**
   * Verify backup code
   */
  private verifyBackupCode(userId: number, code: string): boolean {
    const config = this.configs.get(userId);

    if (!config || !config.backupCodes) {
      return false;
    }

    const hashedCode = this.hashBackupCode(code);
    const index = config.backupCodes.indexOf(hashedCode);

    if (index !== -1) {
      // Remove used backup code
      config.backupCodes.splice(index, 1);
      this.configs.set(userId, config);

      console.log(`[MFA] Backup code used for user ${userId}. Remaining: ${config.backupCodes.length}`);
      return true;
    }

    return false;
  }

  /**
   * Add trusted device
   */
  async addTrustedDevice(
    userId: number,
    deviceName: string,
    deviceFingerprint: string
  ): Promise<TrustedDevice> {
    const config = this.getOrCreateConfig(userId);

    if (!config.trustedDevices) {
      config.trustedDevices = [];
    }

    const device: TrustedDevice = {
      id: crypto.randomBytes(16).toString('hex'),
      name: deviceName,
      fingerprint: deviceFingerprint,
      lastUsed: new Date(),
      createdAt: new Date(),
    };

    config.trustedDevices.push(device);
    this.configs.set(userId, config);

    console.log(`[MFA] Added trusted device for user ${userId}: ${deviceName}`);

    return device;
  }

  /**
   * Check if device is trusted
   */
  isTrustedDevice(userId: number, deviceFingerprint: string): boolean {
    const config = this.configs.get(userId);

    if (!config || !config.trustedDevices) {
      return false;
    }

    const device = config.trustedDevices.find(d => d.fingerprint === deviceFingerprint);

    if (device) {
      // Update last used
      device.lastUsed = new Date();
      this.configs.set(userId, config);
      return true;
    }

    return false;
  }

  /**
   * Remove trusted device
   */
  async removeTrustedDevice(userId: number, deviceId: string): Promise<void> {
    const config = this.configs.get(userId);

    if (!config || !config.trustedDevices) {
      return;
    }

    config.trustedDevices = config.trustedDevices.filter(d => d.id !== deviceId);
    this.configs.set(userId, config);

    console.log(`[MFA] Removed trusted device ${deviceId} for user ${userId}`);
  }

  /**
   * Disable MFA
   */
  async disable(userId: number): Promise<void> {
    const config = this.configs.get(userId);

    if (config) {
      config.enabled = false;
      config.methods = { totp: false, sms: false, webauthn: false };
      this.configs.set(userId, config);

      console.log(`[MFA] Disabled for user ${userId}`);
    }
  }

  /**
   * Get MFA status
   */
  getStatus(userId: number): MFAConfig | null {
    return this.configs.get(userId) || null;
  }

  /**
   * Check if MFA is required for user
   */
  isRequired(userId: number, userRole: string): boolean {
    // Enforce MFA for admin users
    if (userRole === 'admin') {
      return true;
    }

    // Check if user has enabled MFA
    const config = this.configs.get(userId);
    return config?.enabled || false;
  }

  /**
   * Verify WebAuthn using a deterministic trusted-device credential check.
   * Accepted credentials are a trusted device fingerprint, device id, or the
   * SHA-256 hash of either value, which avoids the previous unconditional bypass.
   */
  private verifyWebAuthn(userId: number, credential: string): boolean {
    const config = this.configs.get(userId);

    if (!config || !config.methods.webauthn || !config.trustedDevices?.length) {
      return false;
    }

    const normalized = credential.trim();
    const matches = config.trustedDevices.find((device) => {
      const acceptedValues = [
        device.id,
        device.fingerprint,
        crypto.createHash('sha256').update(device.id).digest('hex'),
        crypto.createHash('sha256').update(device.fingerprint).digest('hex'),
      ];

      return acceptedValues.includes(normalized);
    });

    if (matches) {
      matches.lastUsed = new Date();
      this.configs.set(userId, config);
      console.log(`[MFA] WebAuthn verification succeeded for user ${userId} on trusted device ${matches.name}`);
      return true;
    }

    console.warn(`[MFA] WebAuthn verification failed for user ${userId}`);
    return false;
  }

  /**
   * Hash backup code
   */
  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Get or create config
   */
  private getOrCreateConfig(userId: number): MFAConfig {
    let config = this.configs.get(userId);

    if (!config) {
      config = {
        userId,
        enabled: false,
        methods: {
          totp: false,
          sms: false,
          webauthn: false,
        },
      };
      this.configs.set(userId, config);
    }

    return config;
  }

  /**
   * Generate device fingerprint from request
   */
  static generateDeviceFingerprint(req: any): string {
    const data = [
      req.get('user-agent') || '',
      req.ip || '',
      req.get('accept-language') || '',
      req.get('accept-encoding') || '',
    ].join('|');

    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

/**
 * MFA middleware for Express
 */
export function mfaMiddleware(mfaService: MFAService) {
  return async (req: any, res: any, next: any) => {
    // Skip MFA check for certain routes
    if (req.path.startsWith('/api/auth/mfa') || req.path.startsWith('/api/auth/login')) {
      return next();
    }

    // Check if user is authenticated
    if (!req.user) {
      return next();
    }

    // Check if MFA is required
    if (!mfaService.isRequired(req.user.id, req.user.role)) {
      return next();
    }

    // Check if device is trusted
    const deviceFingerprint = MFAService.generateDeviceFingerprint(req);
    if (mfaService.isTrustedDevice(req.user.id, deviceFingerprint)) {
      return next();
    }

    // Check if MFA is verified in session
    if (req.session?.mfaVerified) {
      return next();
    }

    // MFA required but not verified
    return res.status(403).json({
      error: 'MFA verification required',
      mfaRequired: true,
    });
  };
}

export const mfaService = new MFAService();
