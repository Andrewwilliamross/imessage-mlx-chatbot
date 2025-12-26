/**
 * ImageStorage - Local file management for generated images
 *
 * Features:
 * - Save images from URLs or base64 data
 * - Organize by family member and date
 * - Cleanup old images (rotation)
 * - Get storage statistics
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ImageStorage');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ImageStorage configuration
 */
export interface ImageStorageConfig {
  /** Base path for storing images (supports ~ for home directory) */
  basePath: string;
  /** Maximum age of images in days before cleanup */
  maxAgeDays?: number;
  /** Maximum total storage in MB */
  maxStorageMb?: number;
  /** Whether to create directories automatically */
  autoCreateDirs?: boolean;
}

/**
 * Saved image metadata
 */
export interface SavedImage {
  /** Absolute path to the saved image */
  absolutePath: string;
  /** Relative path from base directory */
  relativePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Family member directory */
  memberId: string;
  /** Original filename */
  filename: string;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  /** Total number of images */
  totalImages: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Total size in MB */
  totalSizeMb: number;
  /** Oldest image date */
  oldestImage?: Date;
  /** Newest image date */
  newestImage?: Date;
  /** Images per member */
  imagesPerMember: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ImageStorage - Local image file management
 */
export class ImageStorage {
  private basePath: string;
  private maxAgeDays: number;
  private maxStorageMb: number;
  private autoCreateDirs: boolean;
  private initialized: boolean = false;

  constructor(config: ImageStorageConfig) {
    // Expand home directory if needed
    this.basePath = config.basePath.replace(/^~/, process.env.HOME || '');
    this.maxAgeDays = config.maxAgeDays ?? 30;
    this.maxStorageMb = config.maxStorageMb ?? 500;
    this.autoCreateDirs = config.autoCreateDirs ?? true;

    logger.debug('ImageStorage initialized', {
      basePath: this.basePath,
      maxAgeDays: this.maxAgeDays,
      maxStorageMb: this.maxStorageMb
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Initialize storage (create directories)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.autoCreateDirs) {
      try {
        await fs.mkdir(this.basePath, { recursive: true });
        logger.info('Storage directory created/verified', { basePath: this.basePath });
        this.initialized = true;
      } catch (error) {
        logger.error('Failed to create storage directory', {
          error: error instanceof Error ? error.message : String(error),
          basePath: this.basePath
        });
        throw error;
      }
    }
  }

  /**
   * Save image from URL
   *
   * @param url - URL to download image from
   * @param memberId - Family member ID for organization
   * @param themeName - Theme name for filename
   * @param date - Date for filename (defaults to now)
   * @returns Saved image metadata
   */
  async saveFromUrl(
    url: string,
    memberId: string,
    themeName: string,
    date: Date = new Date()
  ): Promise<SavedImage> {
    logger.info('Downloading image from URL', {
      memberId,
      themeName,
      urlLength: url.length
    });

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download image: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      return this.saveBuffer(Buffer.from(buffer), memberId, themeName, date);

    } catch (error) {
      logger.error('Failed to download image from URL', {
        error: error instanceof Error ? error.message : String(error),
        memberId
      });
      throw error;
    }
  }

  /**
   * Save image from base64 data
   *
   * @param base64Data - Base64 encoded image data
   * @param memberId - Family member ID for organization
   * @param themeName - Theme name for filename
   * @param date - Date for filename (defaults to now)
   * @returns Saved image metadata
   */
  async saveFromBase64(
    base64Data: string,
    memberId: string,
    themeName: string,
    date: Date = new Date()
  ): Promise<SavedImage> {
    logger.info('Saving image from base64', {
      memberId,
      themeName,
      dataLength: base64Data.length
    });

    const buffer = Buffer.from(base64Data, 'base64');
    return this.saveBuffer(buffer, memberId, themeName, date);
  }

  /**
   * Save image from buffer
   *
   * @param buffer - Image data buffer
   * @param memberId - Family member ID for organization
   * @param themeName - Theme name for filename
   * @param date - Date for filename (defaults to now)
   * @returns Saved image metadata
   */
  async saveBuffer(
    buffer: Buffer,
    memberId: string,
    themeName: string,
    date: Date = new Date()
  ): Promise<SavedImage> {
    await this.initialize();

    // Build file path
    const dateStr = date.toISOString().split('T')[0];
    const safeThemeName = this.sanitizeFilename(themeName);
    const filename = `${dateStr}-${safeThemeName}.png`;
    const memberDir = path.join(this.basePath, memberId);
    const absolutePath = path.join(memberDir, filename);
    const relativePath = path.join(memberId, filename);

    try {
      // Ensure member directory exists
      await fs.mkdir(memberDir, { recursive: true });

      // Write file
      await fs.writeFile(absolutePath, buffer);

      const stats = await fs.stat(absolutePath);

      logger.info('Image saved successfully', {
        absolutePath,
        sizeBytes: stats.size,
        memberId
      });

      return {
        absolutePath,
        relativePath,
        sizeBytes: stats.size,
        createdAt: date,
        memberId,
        filename
      };

    } catch (error) {
      logger.error('Failed to save image buffer', {
        error: error instanceof Error ? error.message : String(error),
        absolutePath,
        memberId
      });
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    await this.initialize();

    const stats: StorageStats = {
      totalImages: 0,
      totalSizeBytes: 0,
      totalSizeMb: 0,
      imagesPerMember: {}
    };

    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;

    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const memberId = entry.name;
        const memberDir = path.join(this.basePath, memberId);

        try {
          const files = await fs.readdir(memberDir);

          for (const file of files) {
            if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) {
              continue;
            }

            const filePath = path.join(memberDir, file);
            const fileStat = await fs.stat(filePath);

            stats.totalImages++;
            stats.totalSizeBytes += fileStat.size;
            stats.imagesPerMember[memberId] = (stats.imagesPerMember[memberId] || 0) + 1;

            // Track dates
            const fileDate = fileStat.mtime;
            if (!oldestDate || fileDate < oldestDate) oldestDate = fileDate;
            if (!newestDate || fileDate > newestDate) newestDate = fileDate;
          }
        } catch {
          // Skip directories we can't read
        }
      }

      stats.totalSizeMb = Math.round((stats.totalSizeBytes / (1024 * 1024)) * 100) / 100;
      stats.oldestImage = oldestDate;
      stats.newestImage = newestDate;

      return stats;

    } catch (error) {
      logger.error('Failed to get storage stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      return stats;
    }
  }

  /**
   * Cleanup old images based on age and storage limits
   *
   * @returns Number of images deleted
   */
  async cleanup(): Promise<number> {
    await this.initialize();

    logger.info('Starting image cleanup', {
      maxAgeDays: this.maxAgeDays,
      maxStorageMb: this.maxStorageMb
    });

    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxAgeDays);

    const filesToConsider: Array<{ path: string; mtime: Date; size: number }> = [];

    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const memberDir = path.join(this.basePath, entry.name);

        try {
          const files = await fs.readdir(memberDir);

          for (const file of files) {
            if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.jpeg')) {
              continue;
            }

            const filePath = path.join(memberDir, file);
            const fileStat = await fs.stat(filePath);

            // Delete if older than max age
            if (fileStat.mtime < cutoffDate) {
              await fs.unlink(filePath);
              deletedCount++;
              logger.debug('Deleted old image', { path: filePath, age: 'exceeded maxAgeDays' });
            } else {
              filesToConsider.push({
                path: filePath,
                mtime: fileStat.mtime,
                size: fileStat.size
              });
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }

      // If still over storage limit, delete oldest files first
      const stats = await this.getStats();
      if (stats.totalSizeMb > this.maxStorageMb) {
        // Sort by date (oldest first)
        filesToConsider.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

        let currentSizeBytes = filesToConsider.reduce((sum, f) => sum + f.size, 0);
        const targetSizeBytes = this.maxStorageMb * 1024 * 1024 * 0.9; // Target 90% of max

        for (const file of filesToConsider) {
          if (currentSizeBytes <= targetSizeBytes) break;

          try {
            await fs.unlink(file.path);
            currentSizeBytes -= file.size;
            deletedCount++;
            logger.debug('Deleted image for storage limit', { path: file.path });
          } catch {
            // Continue on error
          }
        }
      }

      logger.info('Image cleanup completed', {
        deletedCount,
        remainingImages: (await this.getStats()).totalImages
      });

      return deletedCount;

    } catch (error) {
      logger.error('Failed to cleanup images', {
        error: error instanceof Error ? error.message : String(error)
      });
      return deletedCount;
    }
  }

  /**
   * Delete a specific image
   */
  async deleteImage(absolutePath: string): Promise<boolean> {
    try {
      await fs.unlink(absolutePath);
      logger.info('Image deleted', { path: absolutePath });
      return true;
    } catch (error) {
      logger.error('Failed to delete image', {
        error: error instanceof Error ? error.message : String(error),
        path: absolutePath
      });
      return false;
    }
  }

  /**
   * Check if an image exists
   */
  async imageExists(absolutePath: string): Promise<boolean> {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the base storage path
   */
  getBasePath(): string {
    return this.basePath;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Sanitize a string for use in a filename
   */
  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an ImageStorage instance
 */
export function createImageStorage(config: ImageStorageConfig): ImageStorage {
  return new ImageStorage(config);
}

export default ImageStorage;
