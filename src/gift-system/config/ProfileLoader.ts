/**
 * ProfileLoader - Loads and manages family member profiles from JSON configuration
 *
 * Follows the established service patterns:
 * - Async initialization with init() method
 * - Status tracking for loader state
 * - Error handling with detailed logging
 * - Phone number normalization for matching
 */

import fs from 'fs/promises';
import path from 'path';
import {
  FamilyProfilesConfig,
  FamilyMemberConfig,
  FamilyMember,
  FamilyProfileDefaults,
  LoaderStatus,
  ConfigLoader
} from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ProfileLoader');

/**
 * Default configuration values if not specified in JSON
 */
const FALLBACK_DEFAULTS: FamilyProfileDefaults = {
  timezone: 'America/Chicago',
  imageEnabled: true,
  webSearchEnabled: true,
  proactiveEnabled: true
};

/**
 * ProfileLoader - Manages family member profiles from JSON configuration
 *
 * Features:
 * - Lazy loading with caching
 * - Default value resolution
 * - Phone number matching with normalization
 * - Hot reload support
 */
export class ProfileLoader implements ConfigLoader<FamilyProfilesConfig> {
  private config: FamilyProfilesConfig | null = null;
  private profilesPath: string;
  private resolvedPath: string = '';
  private loadedAt: Date | null = null;
  private loadError: string | null = null;

  constructor(profilesPath: string = './config/family-profiles.json') {
    this.profilesPath = profilesPath;
    logger.debug('ProfileLoader initialized', { profilesPath });
  }

  /**
   * Load family profiles from JSON file
   * Returns cached config if already loaded
   */
  async load(): Promise<FamilyProfilesConfig> {
    if (this.config) {
      return this.config;
    }

    const correlationId = logger.generateCorrelationId();

    try {
      this.resolvedPath = path.resolve(this.profilesPath);

      logger.info('Loading family profiles', {
        path: this.resolvedPath,
        correlationId
      });

      // Check file exists
      try {
        await fs.access(this.resolvedPath);
      } catch {
        throw new Error(`Family profiles file not found: ${this.resolvedPath}`);
      }

      // Read and parse JSON
      const content = await fs.readFile(this.resolvedPath, 'utf-8');

      let parsed: FamilyProfilesConfig;
      try {
        parsed = JSON.parse(content) as FamilyProfilesConfig;
      } catch (parseError) {
        const err = parseError as Error;
        throw new Error(`Failed to parse family profiles JSON: ${err.message}`);
      }

      // Validate required fields
      this._validateConfig(parsed);

      this.config = parsed;
      this.loadedAt = new Date();
      this.loadError = null;

      logger.info('Family profiles loaded successfully', {
        version: this.config.version,
        memberCount: this.config.familyMembers.length,
        members: this.config.familyMembers.map(m => m.id),
        correlationId
      });

      return this.config;

    } catch (error) {
      const err = error as Error;
      this.loadError = err.message;

      logger.error('Failed to load family profiles', {
        error: err,
        path: this.profilesPath,
        correlationId
      });

      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Force reload of family profiles
   * Useful for hot-reloading configuration changes
   */
  async reload(): Promise<FamilyProfilesConfig> {
    logger.info('Reloading family profiles');

    // Clear cache
    this.config = null;
    this.loadedAt = null;
    this.loadError = null;

    return this.load();
  }

  /**
   * Get loader status for monitoring
   */
  getStatus(): LoaderStatus {
    return {
      loaded: this.config !== null,
      loadedAt: this.loadedAt || undefined,
      itemCount: this.config?.familyMembers.length,
      error: this.loadError || undefined
    };
  }

  /**
   * Get all enabled family members with resolved defaults
   * Members are enabled if proactiveEnabled is true (or inherits true from defaults)
   */
  async getEnabledMembers(): Promise<FamilyMember[]> {
    const config = await this.load();
    const defaults = config.defaults || FALLBACK_DEFAULTS;

    return config.familyMembers
      .filter(member => {
        const enabled = member.proactiveEnabled ?? defaults.proactiveEnabled;
        return enabled;
      })
      .map(member => this._resolveMemberDefaults(member, defaults));
  }

  /**
   * Get all family members (including disabled) with resolved defaults
   */
  async getAllMembers(): Promise<FamilyMember[]> {
    const config = await this.load();
    const defaults = config.defaults || FALLBACK_DEFAULTS;

    return config.familyMembers.map(member =>
      this._resolveMemberDefaults(member, defaults)
    );
  }

  /**
   * Get a specific family member by ID
   */
  async getMember(id: string): Promise<FamilyMember | undefined> {
    const config = await this.load();
    const defaults = config.defaults || FALLBACK_DEFAULTS;

    const member = config.familyMembers.find(m => m.id === id);
    if (!member) {
      return undefined;
    }

    return this._resolveMemberDefaults(member, defaults);
  }

  /**
   * Find a family member by phone number
   * Normalizes phone numbers for comparison (removes non-digits except +)
   */
  async getMemberByPhone(phone: string): Promise<FamilyMember | undefined> {
    const config = await this.load();
    const defaults = config.defaults || FALLBACK_DEFAULTS;

    const normalizedSearch = this._normalizePhone(phone);

    const member = config.familyMembers.find(m => {
      const normalizedMember = this._normalizePhone(m.phone);
      // Check if either contains the other (handles partial matches)
      return normalizedSearch.includes(normalizedMember) ||
             normalizedMember.includes(normalizedSearch);
    });

    if (!member) {
      return undefined;
    }

    return this._resolveMemberDefaults(member, defaults);
  }

  /**
   * Check if a phone number belongs to a family member
   */
  async isFamilyMember(phone: string): Promise<boolean> {
    const member = await this.getMemberByPhone(phone);
    return member !== undefined;
  }

  /**
   * Get the raw defaults from config
   */
  async getDefaults(): Promise<FamilyProfileDefaults> {
    const config = await this.load();
    return config.defaults || FALLBACK_DEFAULTS;
  }

  /**
   * Get family member IDs for quick lookup
   */
  async getMemberIds(): Promise<string[]> {
    const config = await this.load();
    return config.familyMembers.map(m => m.id);
  }

  /**
   * Validate configuration structure
   */
  private _validateConfig(config: FamilyProfilesConfig): void {
    if (!config.version) {
      throw new Error('Missing required field: version');
    }

    if (!config.familyMembers || !Array.isArray(config.familyMembers)) {
      throw new Error('Missing or invalid familyMembers array');
    }

    if (config.familyMembers.length === 0) {
      logger.warn('No family members configured');
    }

    // Validate each member
    for (const member of config.familyMembers) {
      this._validateMember(member);
    }

    // Check for duplicate IDs
    const ids = config.familyMembers.map(m => m.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate member IDs found: ${duplicates.join(', ')}`);
    }
  }

  /**
   * Validate individual member configuration
   */
  private _validateMember(member: FamilyMemberConfig): void {
    const requiredFields: (keyof FamilyMemberConfig)[] = [
      'id', 'name', 'phone', 'sendTime', 'timezone', 'interests'
    ];

    for (const field of requiredFields) {
      if (member[field] === undefined || member[field] === null) {
        throw new Error(`Member "${member.id || 'unknown'}": Missing required field "${field}"`);
      }
    }

    // Validate phone format (basic check)
    if (!member.phone.startsWith('+')) {
      logger.warn(`Member "${member.id}": Phone number should start with + (E.164 format)`, {
        phone: member.phone.substring(0, 4) + '***'
      });
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(member.sendTime)) {
      throw new Error(`Member "${member.id}": Invalid sendTime format "${member.sendTime}" (expected HH:MM)`);
    }
  }

  /**
   * Resolve member defaults, converting optional flags to required booleans
   */
  private _resolveMemberDefaults(
    member: FamilyMemberConfig,
    defaults: FamilyProfileDefaults
  ): FamilyMember {
    return {
      ...member,
      timezone: member.timezone || defaults.timezone,
      proactiveEnabled: member.proactiveEnabled ?? defaults.proactiveEnabled,
      imageEnabled: member.imageEnabled ?? defaults.imageEnabled,
      webSearchEnabled: member.webSearchEnabled ?? defaults.webSearchEnabled
    };
  }

  /**
   * Normalize phone number for comparison
   * Removes all non-digit characters except leading +
   */
  private _normalizePhone(phone: string): string {
    if (!phone) return '';

    // Keep the + if present at start, remove all other non-digits
    const hasPlus = phone.startsWith('+');
    const digits = phone.replace(/\D/g, '');

    return hasPlus ? `+${digits}` : digits;
  }
}

/**
 * Create a ProfileLoader instance
 * Factory function for dependency injection
 */
export function createProfileLoader(profilesPath?: string): ProfileLoader {
  return new ProfileLoader(profilesPath);
}

export default ProfileLoader;
