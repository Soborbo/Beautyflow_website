/**
 * GTM DataLayer Events
 * Google Ads Enhanced Conversions + GA4
 */

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export interface UserData {
  email: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
}

export interface ConversionParams {
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  value?: number;
  currency?: string;
  transactionId?: string;
  gclid?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+\-]/g, '').trim();
}

export function pushConversion(params: ConversionParams): void {
  window.dataLayer = window.dataLayer || [];

  const userData: UserData = {
    email: normalizeEmail(params.email),
  };

  if (params.phone && params.phone.length >= 8) {
    userData.phone_number = normalizePhone(params.phone);
  }

  if (params.firstName) userData.first_name = params.firstName.trim();
  if (params.lastName) userData.last_name = params.lastName.trim();

  const eventData: Record<string, unknown> = {
    event: 'consultation_conversion',
    user_provided_data: userData,
  };

  if (params.value && params.value > 0) {
    eventData.value = params.value;
    eventData.currency = params.currency || 'HUF';
  }

  if (params.transactionId) eventData.transaction_id = params.transactionId;
  if (params.gclid) eventData.gclid = params.gclid;

  window.dataLayer.push(eventData);
}

export function pushStepEvent(stepId: string, stepIndex: number): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'consultation_step',
    step: stepId,
    stepIndex: stepIndex,
  });
}

export function pushOptionEvent(stepId: string, value: string | string[]): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'consultation_option',
    step: stepId,
    value: Array.isArray(value) ? value.join(',') : value,
  });
}
