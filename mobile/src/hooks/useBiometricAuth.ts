/**
 * Biometric Authentication Hook
 * ================================
 * Provides Face ID / Touch ID / Fingerprint authentication
 * for secure login on iOS and Android.
 */

import { useState, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export function useBiometricAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  /**
   * Check if biometric authentication is available on this device.
   */
  const isBiometricAvailable = useCallback(async (): Promise<{
    available: boolean;
    types: LocalAuthentication.AuthenticationType[];
    enrolled: boolean;
  }> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return {
      available: hasHardware,
      types: supportedTypes,
      enrolled: isEnrolled,
    };
  }, []);

  /**
   * Authenticate using biometrics.
   * Falls back to device PIN if biometrics fail.
   */
  const authenticate = useCallback(
    async (reason = 'Authenticate to access IDLR-PTS'): Promise<BiometricAuthResult> => {
      setIsAuthenticating(true);
      try {
        const { available, enrolled } = await isBiometricAvailable();
        if (!available || !enrolled) {
          return { success: false, error: 'Biometric authentication not available' };
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: reason,
          cancelLabel: 'Use Password',
          disableDeviceFallback: false,
          fallbackLabel: 'Use PIN',
        });

        if (result.success) {
          return { success: true };
        } else {
          return {
            success: false,
            error: result.error === 'user_cancel' ? 'Cancelled' : 'Authentication failed',
          };
        }
      } catch (err) {
        return { success: false, error: String(err) };
      } finally {
        setIsAuthenticating(false);
      }
    },
    [isBiometricAvailable]
  );

  /**
   * Store credentials securely and enable biometric login.
   */
  const enableBiometricLogin = useCallback(
    async (email: string, password: string): Promise<void> => {
      await SecureStore.setItemAsync('biometric_email', email);
      await SecureStore.setItemAsync('biometric_password', password);
      await SecureStore.setItemAsync('biometric_enabled', 'true');
    },
    []
  );

  /**
   * Retrieve stored credentials for biometric login.
   */
  const getBiometricCredentials = useCallback(async (): Promise<{
    email: string;
    password: string;
  } | null> => {
    const enabled = await SecureStore.getItemAsync('biometric_enabled');
    if (enabled !== 'true') return null;

    const email = await SecureStore.getItemAsync('biometric_email');
    const password = await SecureStore.getItemAsync('biometric_password');
    if (!email || !password) return null;

    return { email, password };
  }, []);

  /**
   * Disable biometric login and clear stored credentials.
   */
  const disableBiometricLogin = useCallback(async (): Promise<void> => {
    await SecureStore.deleteItemAsync('biometric_email');
    await SecureStore.deleteItemAsync('biometric_password');
    await SecureStore.deleteItemAsync('biometric_enabled');
  }, []);

  return {
    isAuthenticating,
    authenticate,
    isBiometricAvailable,
    enableBiometricLogin,
    getBiometricCredentials,
    disableBiometricLogin,
  };
}
