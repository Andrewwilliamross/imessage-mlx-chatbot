/**
 * Phone Number Utilities
 *
 * Shared utilities for phone number normalization and formatting.
 * Ensures consistent E.164 format (+1XXXXXXXXXX) for all phone numbers.
 */

export interface PhoneNumberLogger {
  debug(message: string): void;
}

export class PhoneNumberUtils {
  private static logger?: PhoneNumberLogger;

  /**
   * Set optional logger for debug output
   * @param logger - Logger instance with debug method
   */
  static setLogger(logger: PhoneNumberLogger): void {
    this.logger = logger;
  }

  /**
   * Normalize a phone number to E.164 format
   * @param phoneNumber - The phone number to normalize (string or number)
   * @returns Normalized phone number in E.164 format (+1XXXXXXXXXX)
   *
   * @example
   * normalizePhoneNumber('3108904103') // '+13108904103'
   * normalizePhoneNumber('13108904103') // '+13108904103'
   * normalizePhoneNumber('+13108904103') // '+13108904103'
   * normalizePhoneNumber('user@example.com') // 'user@example.com' (email passthrough)
   */
  static normalizePhoneNumber(phoneNumber: string | number): string {
    if (!phoneNumber) return String(phoneNumber);

    // Convert to string if it's a number
    const phoneStr = String(phoneNumber);

    // Handle email addresses - return as-is
    if (phoneStr.includes('@')) {
      return phoneStr;
    }

    // Remove all non-digit characters
    const digitsOnly = phoneStr.replace(/\D/g, '');

    // Handle different cases
    if (digitsOnly.length === 10) {
      // US number without country code: 3108904103 -> +13108904103
      const normalized = `+1${digitsOnly}`;
      this.logger?.debug(`Normalizing 10-digit number: ${phoneStr} -> ${normalized}`);
      return normalized;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      // US number with country code: 13108904103 -> +13108904103
      const normalized = `+${digitsOnly}`;
      this.logger?.debug(`Normalizing 11-digit number: ${phoneStr} -> ${normalized}`);
      return normalized;
    } else if (phoneStr.startsWith('+')) {
      // Already properly formatted: +13108904103
      this.logger?.debug(`Phone number already normalized: ${phoneStr}`);
      return phoneStr;
    } else if (digitsOnly.length > 10) {
      // International number, add + if missing
      const normalized = phoneStr.startsWith('+') ? phoneStr : `+${digitsOnly}`;
      this.logger?.debug(`Normalizing international number: ${phoneStr} -> ${normalized}`);
      return normalized;
    }

    // Default: add +1 for US numbers
    const normalized = digitsOnly.length >= 10 ? `+1${digitsOnly.slice(-10)}` : phoneStr;
    this.logger?.debug(`Normalizing phone number (default): ${phoneStr} -> ${normalized}`);
    return normalized;
  }

  /**
   * Format a phone number for display (US format)
   * @param phoneNumber - The phone number to format
   * @returns Formatted phone number (XXX) XXX-XXXX for US numbers
   *
   * @example
   * formatDisplayNumber('+13108904103') // '(310) 890-4103'
   * formatDisplayNumber('3108904103') // '(310) 890-4103'
   * formatDisplayNumber('user@example.com') // 'user@example.com' (email passthrough)
   */
  static formatDisplayNumber(phoneNumber: string | number): string {
    if (!phoneNumber) return String(phoneNumber);

    const phoneStr = String(phoneNumber);

    // Handle email addresses - return as-is
    if (phoneStr.includes('@')) {
      return phoneStr;
    }

    const normalized = this.normalizePhoneNumber(phoneNumber);
    const digitsOnly = normalized.replace(/\D/g, '');

    // Format US numbers as (XXX) XXX-XXXX
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      const areaCode = digitsOnly.slice(1, 4);
      const prefix = digitsOnly.slice(4, 7);
      const number = digitsOnly.slice(7);
      return `(${areaCode}) ${prefix}-${number}`;
    }

    // Return normalized format for international numbers
    return normalized;
  }

  /**
   * Validate if a string is a valid phone number
   * @param phoneNumber - The phone number to validate
   * @returns True if valid phone number, false otherwise
   *
   * @example
   * isValidPhoneNumber('+13108904103') // true
   * isValidPhoneNumber('3108904103') // true
   * isValidPhoneNumber('invalid') // false
   */
  static isValidPhoneNumber(phoneNumber: string | number): boolean {
    if (!phoneNumber) return false;

    const phoneStr = String(phoneNumber);

    // Email addresses are not phone numbers
    if (phoneStr.includes('@')) return false;

    const digitsOnly = phoneStr.replace(/\D/g, '');

    // Valid if at least 10 digits
    return digitsOnly.length >= 10;
  }
}

export default PhoneNumberUtils;
