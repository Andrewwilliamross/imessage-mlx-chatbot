/**
 * PhotosLibrary - macOS Photos.app AppleScript integration
 *
 * Features:
 * - Import images to Photos.app
 * - Create and manage albums
 * - Verify successful imports
 * - Error handling with graceful degradation
 *
 * Note: Requires Full Disk Access permission for Photos Library
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../../utils/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('PhotosLibrary');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PhotosLibrary configuration
 */
export interface PhotosLibraryConfig {
  /** Album name to import images into */
  albumName: string;
  /** Timeout for AppleScript execution in ms */
  timeoutMs?: number;
  /** Whether to activate Photos app during import */
  activateApp?: boolean;
  /** Delay after activation in seconds */
  activationDelay?: number;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  success: boolean;
  albumName: string;
  imagePath: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHOTOS LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PhotosLibrary - Interface for macOS Photos.app
 */
export class PhotosLibrary {
  private albumName: string;
  private timeoutMs: number;
  private activateApp: boolean;
  private activationDelay: number;
  private albumVerified: boolean = false;

  constructor(config: PhotosLibraryConfig) {
    this.albumName = config.albumName;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.activateApp = config.activateApp ?? true;
    this.activationDelay = config.activationDelay ?? 1;

    logger.debug('PhotosLibrary initialized', {
      albumName: this.albumName,
      timeoutMs: this.timeoutMs
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Import an image into Photos.app and add to the configured album
   *
   * @param imagePath - Absolute POSIX path to the image file
   * @returns Import result with success status
   */
  async importImage(imagePath: string): Promise<ImportResult> {
    logger.info('Importing image to Photos', {
      imagePath,
      albumName: this.albumName
    });

    try {
      // Ensure album exists first
      if (!this.albumVerified) {
        await this.ensureAlbumExists();
        this.albumVerified = true;
      }

      // Build and execute import script
      const script = this.buildImportScript(imagePath);
      const result = await this.executeAppleScript(script);

      if (result.includes('Success') || result.includes('success')) {
        logger.info('Image imported successfully', {
          imagePath,
          albumName: this.albumName
        });

        return {
          success: true,
          albumName: this.albumName,
          imagePath
        };
      }

      // Check for common errors
      if (result.includes('error') || result.includes('Error')) {
        throw new Error(result);
      }

      // Assume success if no explicit error
      return {
        success: true,
        albumName: this.albumName,
        imagePath
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to import image to Photos', {
        error: errorMessage,
        imagePath,
        albumName: this.albumName
      });

      return {
        success: false,
        albumName: this.albumName,
        imagePath,
        error: errorMessage
      };
    }
  }

  /**
   * Ensure the target album exists, create if not
   */
  async ensureAlbumExists(): Promise<boolean> {
    logger.debug('Verifying album exists', { albumName: this.albumName });

    const script = `
      tell application "Photos"
        if not (exists album "${this.escapeAppleScript(this.albumName)}") then
          make new album named "${this.escapeAppleScript(this.albumName)}"
          return "Created"
        else
          return "Exists"
        end if
      end tell
    `;

    try {
      const result = await this.executeAppleScript(script);
      const created = result.includes('Created');

      logger.info('Album verification complete', {
        albumName: this.albumName,
        created
      });

      return true;

    } catch (error) {
      logger.error('Failed to verify/create album', {
        error: error instanceof Error ? error.message : String(error),
        albumName: this.albumName
      });
      return false;
    }
  }

  /**
   * Check if Photos.app is running
   */
  async isPhotosRunning(): Promise<boolean> {
    const script = `
      tell application "System Events"
        return (name of processes) contains "Photos"
      end tell
    `;

    try {
      const result = await this.executeAppleScript(script);
      return result.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get count of items in the album
   */
  async getAlbumItemCount(): Promise<number> {
    const script = `
      tell application "Photos"
        if exists album "${this.escapeAppleScript(this.albumName)}" then
          return count of media items of album "${this.escapeAppleScript(this.albumName)}"
        else
          return 0
        end if
      end tell
    `;

    try {
      const result = await this.executeAppleScript(script);
      return parseInt(result.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Test connection to Photos.app
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureAlbumExists();
      return true;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Build AppleScript for importing an image
   */
  private buildImportScript(imagePath: string): string {
    const escapedPath = this.escapeAppleScript(imagePath);
    const escapedAlbum = this.escapeAppleScript(this.albumName);

    // Build the import script
    // Note: Photos.app needs to be frontmost for import to work reliably
    let script = `
      tell application "Photos"
    `;

    if (this.activateApp) {
      script += `
        activate
        delay ${this.activationDelay}
      `;
    }

    script += `
        -- Import the image
        set theImage to import POSIX file "${escapedPath}"

        -- Wait a moment for import to complete
        delay 0.5

        -- Get the album
        set theAlbum to album "${escapedAlbum}"

        -- Add to album
        add theImage to theAlbum

        return "Success"
      end tell
    `;

    return script;
  }

  /**
   * Execute an AppleScript with timeout handling
   */
  private async executeAppleScript(script: string): Promise<string> {
    // Escape single quotes for shell
    const escapedScript = script.replace(/'/g, "'\"'\"'");

    try {
      const { stdout, stderr } = await Promise.race([
        execAsync(`osascript -e '${escapedScript}'`),
        this.createTimeout()
      ]) as { stdout: string; stderr: string };

      if (stderr && stderr.length > 0 && !stderr.includes('success')) {
        logger.warn('AppleScript stderr output', { stderr });
      }

      return stdout.trim();

    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`AppleScript execution timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('timeout'));
      }, this.timeoutMs);
    });
  }

  /**
   * Escape string for AppleScript
   */
  private escapeAppleScript(str: string): string {
    // Escape backslashes first, then quotes
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a PhotosLibrary instance
 */
export function createPhotosLibrary(config: PhotosLibraryConfig): PhotosLibrary {
  return new PhotosLibrary(config);
}

export default PhotosLibrary;
