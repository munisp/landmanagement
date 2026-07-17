/**
 * Smart Forms System
 * Auto-save, field validation, and progress tracking
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from 'lodash-es';

export interface SmartFormConfig {
  formId: string;
  autoSave?: boolean;
  autoSaveDelay?: number; // milliseconds
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  persistToStorage?: boolean;
  onAutoSave?: (data: any) => void | Promise<void>;
}

export interface FieldValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null; // Returns error message or null
  asyncValidator?: (value: any) => Promise<string | null>;
}

export interface FormField {
  name: string;
  value: any;
  error?: string;
  touched?: boolean;
  validating?: boolean;
}

export interface FormState {
  fields: Record<string, FormField>;
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  lastSaved?: Date;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

/**
 * Smart Form Hook
 */
export function useSmartForm<T extends Record<string, any>>(
  initialValues: T,
  validations: Record<keyof T, FieldValidation>,
  config: SmartFormConfig
) {
  const [formState, setFormState] = useState<FormState>({
    fields: Object.keys(initialValues).reduce((acc, key) => {
      acc[key] = {
        name: key,
        value: initialValues[key],
        touched: false,
      };
      return acc;
    }, {} as Record<string, FormField>),
    isValid: false,
    isDirty: false,
    isSubmitting: false,
    saveStatus: 'idle',
  });

  // Debounced auto-save function
  const debouncedAutoSave = useCallback(
    debounce((data: any) => {
      if (config.autoSave && config.onAutoSave) {
        config.onAutoSave(data);
        setFormState(prev => ({ ...prev, saveStatus: 'saved' }));
      }
    }, config.autoSaveDelay || 1000),
    [config.autoSave, config.autoSaveDelay, config.onAutoSave]
  );

  // Load from storage on mount
  useEffect(() => {
    if (config.persistToStorage) {
      const saved = loadFromStorage(config.formId);
      if (saved) {
        setFormState(prev => ({
          ...prev,
          fields: saved.fields,
          isDirty: true,
        }));
      }
    }
  }, [config.formId, config.persistToStorage]);

  // Auto-save
  const autoSave = useCallback(
    debounce(async (fields: Record<string, FormField>) => {
      if (!config.autoSave) return;

      setFormState(prev => ({ ...prev, saveStatus: 'saving' }));

      try {
        // Save to localStorage
        if (config.persistToStorage) {
          saveToStorage(config.formId, { fields });
        }

        setFormState(prev => ({
          ...prev,
          saveStatus: 'saved',
          lastSaved: new Date(),
        }));

        // Reset status after 2 seconds
        setTimeout(() => {
          setFormState(prev => ({ ...prev, saveStatus: 'idle' }));
        }, 2000);
      } catch (error) {
        setFormState(prev => ({ ...prev, saveStatus: 'error' }));
      }
    }, config.autoSaveDelay || 1000),
    [config.autoSave, config.autoSaveDelay, config.formId, config.persistToStorage]
  );

  // Validate field
  const validateField = useCallback(
    async (name: string, value: any): Promise<string | null> => {
      const validation = validations[name as keyof T];
      if (!validation) return null;

      // Required
      if (validation.required && !value) {
        return 'This field is required';
      }

      // Min length
      if (validation.minLength && String(value).length < validation.minLength) {
        return `Minimum length is ${validation.minLength} characters`;
      }

      // Max length
      if (validation.maxLength && String(value).length > validation.maxLength) {
        return `Maximum length is ${validation.maxLength} characters`;
      }

      // Pattern
      if (validation.pattern && !validation.pattern.test(String(value))) {
        return 'Invalid format';
      }

      // Custom validation
      if (validation.custom) {
        const error = validation.custom(value);
        if (error) return error;
      }

      // Async validation
      if (validation.asyncValidator) {
        setFormState(prev => ({
          ...prev,
          fields: {
            ...prev.fields,
            [name]: { ...prev.fields[name], validating: true },
          },
        }));

        const error = await validation.asyncValidator(value);

        setFormState(prev => ({
          ...prev,
          fields: {
            ...prev.fields,
            [name]: { ...prev.fields[name], validating: false },
          },
        }));

        if (error) return error;
      }

      return null;
    },
    [validations]
  );

  // Set field value
  const setFieldValue = useCallback(
    async (name: string, value: any) => {
      setFormState(prev => {
        const newFields = {
          ...prev.fields,
          [name]: {
            ...prev.fields[name],
            value,
            touched: true,
          },
        };

        // Trigger auto-save
        if (config.autoSave) {
          autoSave(newFields);
        }

        return {
          ...prev,
          fields: newFields,
          isDirty: true,
        };
      });

      // Validate on change
      if (config.validateOnChange) {
        const error = await validateField(name, value);
        setFormState(prev => ({
          ...prev,
          fields: {
            ...prev.fields,
            [name]: { ...prev.fields[name], error: error || undefined },
          },
        }));
      }
    },
    [config.autoSave, config.validateOnChange, autoSave, validateField]
  );

  // Handle field blur
  const handleBlur = useCallback(
    async (name: string) => {
      if (!config.validateOnBlur) return;

      const value = formState.fields[name]?.value;
      const error = await validateField(name, value);

      setFormState(prev => ({
        ...prev,
        fields: {
          ...prev.fields,
          [name]: { ...prev.fields[name], error: error || undefined, touched: true },
        },
      }));
    },
    [config.validateOnBlur, formState.fields, validateField]
  );

  // Validate all fields
  const validateAll = useCallback(async (): Promise<boolean> => {
    const errors: Record<string, string> = {};

    for (const [name, field] of Object.entries(formState.fields)) {
      const error = await validateField(name, field.value);
      if (error) {
        errors[name] = error;
      }
    }

    setFormState(prev => ({
      ...prev,
      fields: Object.keys(prev.fields).reduce((acc, name) => {
        acc[name] = {
          ...prev.fields[name],
          error: errors[name],
          touched: true,
        };
        return acc;
      }, {} as Record<string, FormField>),
      isValid: Object.keys(errors).length === 0,
    }));

    return Object.keys(errors).length === 0;
  }, [formState.fields, validateField]);

  // Get field props for input binding
  const getFieldProps = useCallback(
    (name: string) => ({
      name,
      value: formState.fields[name]?.value || '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setFieldValue(name, e.target.value),
      onBlur: () => handleBlur(name),
      error: formState.fields[name]?.error,
      touched: formState.fields[name]?.touched,
    }),
    [formState.fields, setFieldValue, handleBlur]
  );

  // Get values
  const getValues = useCallback((): T => {
    return Object.keys(formState.fields).reduce((acc, key) => {
      acc[key as keyof T] = formState.fields[key].value;
      return acc;
    }, {} as T);
  }, [formState.fields]);

  // Reset form
  const reset = useCallback(() => {
    setFormState({
      fields: Object.keys(initialValues).reduce((acc, key) => {
        acc[key] = {
          name: key,
          value: initialValues[key],
          touched: false,
        };
        return acc;
      }, {} as Record<string, FormField>),
      isValid: false,
      isDirty: false,
      isSubmitting: false,
      saveStatus: 'idle',
    });

    // Clear storage
    if (config.persistToStorage) {
      clearFromStorage(config.formId);
    }
  }, [initialValues, config.formId, config.persistToStorage]);

  // Submit handler
  const handleSubmit = useCallback(
    async (onSubmit: (values: T) => Promise<void> | void) => {
      const isValid = await validateAll();

      if (!isValid) {
        return;
      }

      setFormState(prev => ({ ...prev, isSubmitting: true }));

      try {
        await onSubmit(getValues());

        // Clear storage after successful submit
        if (config.persistToStorage) {
          clearFromStorage(config.formId);
        }

        reset();
      } catch (error) {
        console.error('Form submission error:', error);
      } finally {
        setFormState(prev => ({ ...prev, isSubmitting: false }));
      }
    },
    [validateAll, getValues, config.formId, config.persistToStorage, reset]
  );

  return {
    fields: formState.fields,
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    isSubmitting: formState.isSubmitting,
    saveStatus: formState.saveStatus,
    lastSaved: formState.lastSaved,
    setFieldValue,
    getFieldProps,
    getValues,
    validateAll,
    handleSubmit,
    reset,
  };
}

/**
 * Storage helpers
 */
function saveToStorage(formId: string, data: any) {
  try {
    localStorage.setItem(`smart-form-${formId}`, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save form to storage:', error);
  }
}

function loadFromStorage(formId: string): any | null {
  try {
    const data = localStorage.getItem(`smart-form-${formId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load form from storage:', error);
    return null;
  }
}

function clearFromStorage(formId: string) {
  try {
    localStorage.removeItem(`smart-form-${formId}`);
  } catch (error) {
    console.error('Failed to clear form from storage:', error);
  }
}

/**
 * Common validation rules
 */
export const ValidationRules = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    custom: (value: string) => {
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return 'Please enter a valid email address';
      }
      return null;
    },
  },
  phone: {
    pattern: /^(\+?234|0)[789]\d{9}$/,
    custom: (value: string) => {
      if (value && !/^(\+?234|0)[789]\d{9}$/.test(value)) {
        return 'Please enter a valid Nigerian phone number';
      }
      return null;
    },
  },
  nin: {
    pattern: /^\d{11}$/,
    custom: (value: string) => {
      if (value && !/^\d{11}$/.test(value)) {
        return 'NIN must be 11 digits';
      }
      return null;
    },
  },
  coordinates: {
    pattern: /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/,
    custom: (value: string) => {
      if (value && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(value)) {
        return 'Coordinates must be in format: latitude, longitude';
      }
      return null;
    },
  },
};
