/**
 * ImageGenerator - Orchestrates image generation for daily gifts
 *
 * Features:
 * - Generate personalized images via OpenRouter API
 * - Build contextual prompts based on theme and family member
 * - Save images locally via ImageStorage
 * - Import to Photos.app via PhotosLibrary (optional)
 * - Graceful degradation on failures
 */

import { OpenRouterClient, OpenRouterConfig } from '../openrouter/OpenRouterClient.js';
import { ImageStorage, ImageStorageConfig, SavedImage } from './ImageStorage.js';
import { PhotosLibrary, PhotosLibraryConfig } from './PhotosLibrary.js';
import { FamilyMember, GeneratedImage } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ImageGenerator');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ImageGenerator configuration
 */
export interface ImageGeneratorConfig {
  // OpenRouter settings
  /** OpenRouter API key */
  openRouterApiKey: string;
  /** Image model to use (e.g., "black-forest-labs/flux-1.1-pro") */
  imageModel?: string;
  /** Image size (e.g., "1024x1024") */
  imageSize?: string;
  /** Image quality ("standard" or "hd") */
  imageQuality?: string;

  // Storage settings
  /** Base path for storing images */
  storagePath: string;
  /** Maximum age of images in days */
  maxImageAgeDays?: number;
  /** Maximum storage in MB */
  maxStorageMb?: number;

  // Photos.app settings
  /** Whether to import to Photos.app */
  photosEnabled?: boolean;
  /** Photos.app album name */
  photosAlbumName?: string;
  /** Timeout for Photos.app operations */
  photosTimeoutMs?: number;
}

/**
 * Options for a single image generation
 */
export interface ImageGenerationOptions {
  /** Override model for this generation */
  model?: string;
  /** Override size for this generation */
  size?: string;
  /** Override quality for this generation */
  quality?: string;
  /** Skip Photos.app import */
  skipPhotos?: boolean;
  /** Custom prompt suffix */
  promptSuffix?: string;
}

/**
 * Result of an image generation attempt
 */
export interface ImageGenerationResult {
  success: boolean;
  image?: GeneratedImage;
  error?: string;
  savedImage?: SavedImage;
  photosImported: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ImageGenerator - Main image generation orchestrator
 */
export class ImageGenerator {
  private openRouterClient: OpenRouterClient;
  private imageStorage: ImageStorage;
  private photosLibrary: PhotosLibrary | null;
  private imageModel: string;
  private imageSize: string;
  private imageQuality: string;
  private photosEnabled: boolean;
  private initialized: boolean = false;

  constructor(config: ImageGeneratorConfig) {
    // Initialize OpenRouter client
    const openRouterConfig: OpenRouterConfig = {
      apiKey: config.openRouterApiKey,
      defaultModel: config.imageModel ?? 'black-forest-labs/flux-1.1-pro'
    };
    this.openRouterClient = new OpenRouterClient(openRouterConfig);

    // Initialize image storage
    const storageConfig: ImageStorageConfig = {
      basePath: config.storagePath,
      maxAgeDays: config.maxImageAgeDays ?? 30,
      maxStorageMb: config.maxStorageMb ?? 500,
      autoCreateDirs: true
    };
    this.imageStorage = new ImageStorage(storageConfig);

    // Initialize Photos.app library if enabled
    this.photosEnabled = config.photosEnabled ?? true;
    if (this.photosEnabled) {
      const photosConfig: PhotosLibraryConfig = {
        albumName: config.photosAlbumName ?? 'Family Daily Gifts',
        timeoutMs: config.photosTimeoutMs ?? 30000,
        activateApp: true
      };
      this.photosLibrary = new PhotosLibrary(photosConfig);
    } else {
      this.photosLibrary = null;
    }

    // Store settings
    this.imageModel = config.imageModel ?? 'black-forest-labs/flux-1.1-pro';
    this.imageSize = config.imageSize ?? '1024x1024';
    this.imageQuality = config.imageQuality ?? 'standard';

    logger.debug('ImageGenerator initialized', {
      model: this.imageModel,
      size: this.imageSize,
      photosEnabled: this.photosEnabled,
      storagePath: config.storagePath
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the image generator (create directories, verify Photos.app)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing ImageGenerator');

    try {
      // Initialize storage
      await this.imageStorage.initialize();

      // Test Photos.app connection if enabled
      if (this.photosLibrary) {
        const photosConnected = await this.photosLibrary.testConnection();
        if (!photosConnected) {
          logger.warn('Photos.app connection failed, disabling Photos integration');
          this.photosEnabled = false;
        }
      }

      this.initialized = true;
      logger.info('ImageGenerator initialized successfully', {
        photosEnabled: this.photosEnabled
      });
    } catch (error) {
      logger.error('Failed to initialize ImageGenerator', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate an image for a family member based on their interests
   *
   * @param member - Family member configuration
   * @param options - Optional generation overrides
   * @returns Generation result with image metadata
   */
  async generateForMember(
    member: FamilyMember,
    options: ImageGenerationOptions = {}
  ): Promise<ImageGenerationResult> {
    const correlationId = logger.generateCorrelationId();

    logger.info('Starting image generation for member', {
      memberId: member.id,
      memberName: member.name,
      correlationId
    });

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Build the image prompt
      const prompt = this.buildPrompt(member, options);

      logger.debug('Generated image prompt', {
        promptLength: prompt.length,
        correlationId
      });

      // Generate image via OpenRouter
      const imageResult = await this.openRouterClient.generateImage(prompt, {
        model: options.model ?? this.imageModel,
        size: options.size ?? this.imageSize,
        quality: options.quality ?? this.imageQuality
      });

      if (!imageResult.url && !imageResult.b64_json) {
        throw new Error('No image data returned from OpenRouter');
      }

      // Save the image locally
      let savedImage: SavedImage;
      if (imageResult.url) {
        savedImage = await this.imageStorage.saveFromUrl(
          imageResult.url,
          member.id,
          'daily'
        );
      } else if (imageResult.b64_json) {
        savedImage = await this.imageStorage.saveFromBase64(
          imageResult.b64_json,
          member.id,
          'daily'
        );
      } else {
        throw new Error('Unexpected: no image data');
      }

      logger.info('Image saved locally', {
        path: savedImage.absolutePath,
        sizeBytes: savedImage.sizeBytes,
        correlationId
      });

      // Import to Photos.app if enabled
      let photosImported = false;
      if (this.photosEnabled && this.photosLibrary && !options.skipPhotos) {
        try {
          const importResult = await this.photosLibrary.importImage(savedImage.absolutePath);
          photosImported = importResult.success;

          if (photosImported) {
            logger.info('Image imported to Photos.app', {
              albumName: importResult.albumName,
              correlationId
            });
          } else {
            logger.warn('Photos.app import failed', {
              error: importResult.error,
              correlationId
            });
          }
        } catch (photosError) {
          logger.warn('Photos.app import threw error', {
            error: photosError instanceof Error ? photosError.message : String(photosError),
            correlationId
          });
          // Don't fail the whole generation for Photos.app issues
        }
      }

      // Build result
      const generatedImage: GeneratedImage = {
        localPath: savedImage.absolutePath,
        prompt,
        model: options.model ?? this.imageModel,
        timestamp: new Date(),
        addedToPhotos: photosImported
      };

      logger.info('Image generation completed successfully', {
        memberId: member.id,
        path: savedImage.absolutePath,
        photosImported,
        correlationId
      });

      return {
        success: true,
        image: generatedImage,
        savedImage,
        photosImported
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Image generation failed', {
        error: errorMessage,
        memberId: member.id,
        correlationId
      });

      return {
        success: false,
        error: errorMessage,
        photosImported: false
      };
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Generate an image using a custom prompt
   *
   * @param customPrompt - The image prompt to use
   * @param memberId - Member ID for storage organization
   * @param options - Optional generation overrides
   * @returns Generation result with image metadata
   */
  async generateWithPrompt(
    customPrompt: string,
    memberId: string,
    options: ImageGenerationOptions & { saveToPhotos?: boolean } = {}
  ): Promise<ImageGenerationResult> {
    const correlationId = logger.generateCorrelationId();

    logger.info('Starting image generation with custom prompt', {
      memberId,
      promptLength: customPrompt.length,
      correlationId
    });

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate image via OpenRouter
      const imageResult = await this.openRouterClient.generateImage(customPrompt, {
        model: options.model ?? this.imageModel,
        size: options.size ?? this.imageSize,
        quality: options.quality ?? this.imageQuality
      });

      if (!imageResult.url && !imageResult.b64_json) {
        throw new Error('No image data returned from OpenRouter');
      }

      // Save the image locally
      let savedImage: SavedImage;
      if (imageResult.url) {
        savedImage = await this.imageStorage.saveFromUrl(
          imageResult.url,
          memberId,
          'custom'
        );
      } else if (imageResult.b64_json) {
        savedImage = await this.imageStorage.saveFromBase64(
          imageResult.b64_json,
          memberId,
          'custom'
        );
      } else {
        throw new Error('Unexpected: no image data');
      }

      logger.info('Image saved locally', {
        path: savedImage.absolutePath,
        sizeBytes: savedImage.sizeBytes,
        correlationId
      });

      // Import to Photos.app if enabled
      let photosImported = false;
      const shouldImportToPhotos = options.saveToPhotos ?? (this.photosEnabled && !options.skipPhotos);

      if (shouldImportToPhotos && this.photosLibrary) {
        try {
          const importResult = await this.photosLibrary.importImage(savedImage.absolutePath);
          photosImported = importResult.success;

          if (photosImported) {
            logger.info('Image imported to Photos.app', {
              albumName: importResult.albumName,
              correlationId
            });
          }
        } catch (photosError) {
          logger.warn('Photos.app import threw error', {
            error: photosError instanceof Error ? photosError.message : String(photosError),
            correlationId
          });
        }
      }

      // Build result
      const generatedImage: GeneratedImage = {
        localPath: savedImage.absolutePath,
        prompt: customPrompt,
        model: options.model ?? this.imageModel,
        timestamp: new Date(),
        addedToPhotos: photosImported
      };

      logger.info('Image generation with custom prompt completed', {
        memberId,
        path: savedImage.absolutePath,
        photosImported,
        correlationId
      });

      return {
        success: true,
        image: generatedImage,
        savedImage,
        photosImported
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Image generation with custom prompt failed', {
        error: errorMessage,
        memberId,
        correlationId
      });

      return {
        success: false,
        error: errorMessage,
        photosImported: false
      };
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Cleanup old images based on age and storage limits
   */
  async cleanup(): Promise<number> {
    logger.info('Starting image cleanup');
    return this.imageStorage.cleanup();
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    return this.imageStorage.getStats();
  }

  /**
   * Test all connections (OpenRouter, Photos.app)
   */
  async testConnections(): Promise<{
    openRouter: boolean;
    photos: boolean;
    storage: boolean;
  }> {
    const results = {
      openRouter: false,
      photos: false,
      storage: false
    };

    // Test OpenRouter
    try {
      results.openRouter = await this.openRouterClient.testConnection();
    } catch {
      results.openRouter = false;
    }

    // Test Photos.app
    if (this.photosLibrary) {
      try {
        results.photos = await this.photosLibrary.testConnection();
      } catch {
        results.photos = false;
      }
    } else {
      results.photos = true; // Disabled means "not failing"
    }

    // Test storage
    try {
      await this.imageStorage.initialize();
      results.storage = true;
    } catch {
      results.storage = false;
    }

    return results;
  }

  /**
   * Check if generator is configured
   */
  isConfigured(): boolean {
    return this.openRouterClient.isConfigured();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Build an image generation prompt for a family member
   */
  private buildPrompt(
    member: FamilyMember,
    options: ImageGenerationOptions
  ): string {
    // Get the image style from the member's profile
    const baseStyle = member.imageStyle ?? '';

    // Build contextual prompt parts
    const parts: string[] = [];

    // Add base style if available
    if (baseStyle) {
      parts.push(baseStyle);
    } else {
      // Fallback to a generic style based on interests
      parts.push(this.getDefaultStyleForMember(member));
    }

    // Add seasonal context
    const season = this.getCurrentSeason();
    parts.push(`Season: ${season}`);

    // Add personalization hints from interests
    if (member.interests.length > 0) {
      const relevantInterests = this.selectRelevantInterests(member.interests);
      if (relevantInterests.length > 0) {
        parts.push(`Incorporate elements of: ${relevantInterests.join(', ')}`);
      }
    }

    // Add custom suffix if provided
    if (options.promptSuffix) {
      parts.push(options.promptSuffix);
    }

    // Add quality/style guidance
    parts.push('High quality, beautiful lighting, warm atmosphere');
    parts.push('Suitable for sharing as a thoughtful daily message');

    return parts.join('. ');
  }

  /**
   * Get a default image style based on member's interests
   */
  private getDefaultStyleForMember(member: FamilyMember): string {
    const interestStyles: Record<string, string> = {
      christianity: 'Serene spiritual scene, peaceful morning light, inspirational atmosphere',
      faith: 'Serene spiritual scene, peaceful morning light, inspirational atmosphere',
      cooking: 'Beautiful food photography, warm kitchen setting, appetizing presentation',
      history: 'Vintage-inspired scene, historical elements, sepia tones with modern clarity',
      gardening: 'Lush garden scene, vibrant flowers, morning dew, natural beauty',
      baking: 'Cozy kitchen scene, fresh baked goods, warm inviting atmosphere',
      antiques: 'Elegant antique still life, warm lighting, rich textures',
      design: 'Modern interior design, stylish decor, clean aesthetic',
      music: 'Musical instruments, artistic composition, creative atmosphere',
      art: 'Artistic scene, creative inspiration, beautiful composition',
      travel: 'Scenic travel destination, wanderlust inspiration, beautiful landscape',
      wellness: 'Peaceful wellness scene, calm and serene, health-focused imagery',
      fitness: 'Active lifestyle scene, energetic atmosphere, motivational imagery',
      architecture: 'Stunning architectural photography, interesting structures, beautiful design',
      fashion: 'Stylish fashion scene, elegant presentation, modern aesthetic'
    };

    // Find a matching style based on member's interests
    for (const interest of member.interests) {
      const key = interest.toLowerCase();
      if (interestStyles[key]) {
        return interestStyles[key];
      }
    }

    return 'Beautiful, inspiring scene with warm atmosphere';
  }

  /**
   * Get the current season
   */
  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  /**
   * Select a subset of interests to incorporate into the image
   * Uses day of week for variety - different interests on different days
   */
  private selectRelevantInterests(interests: string[]): string[] {
    if (interests.length <= 2) {
      return interests;
    }

    // Use day of week to rotate which interests we highlight
    const dayIndex = new Date().getDay();
    const startIndex = dayIndex % interests.length;

    // Pick 2 interests starting from the day-based offset
    const selected: string[] = [];
    for (let i = 0; i < 2 && i < interests.length; i++) {
      const idx = (startIndex + i) % interests.length;
      selected.push(interests[idx]);
    }

    return selected;
  }

  /**
   * Check if two concepts are related
   */
  private areConceptsRelated(concept1: string, concept2: string): boolean {
    const relatedConcepts: Record<string, string[]> = {
      cooking: ['recipe', 'baking', 'food'],
      baking: ['recipe', 'cooking', 'food'],
      garden: ['nature', 'plants', 'flowers'],
      art: ['design', 'culture', 'fashion'],
      travel: ['culture', 'history', 'architecture'],
      fitness: ['wellness', 'health'],
      wellness: ['fitness', 'health'],
      music: ['art', 'culture'],
      history: ['culture', 'antiques']
    };

    const related1 = relatedConcepts[concept1] ?? [];
    const related2 = relatedConcepts[concept2] ?? [];

    return related1.includes(concept2) || related2.includes(concept1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an ImageGenerator instance
 */
export function createImageGenerator(config: ImageGeneratorConfig): ImageGenerator {
  return new ImageGenerator(config);
}

export default ImageGenerator;
