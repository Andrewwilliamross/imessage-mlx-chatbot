/**
 * Image Module - Image generation and management for Family Daily Gift System
 *
 * This module provides:
 * - ImageGenerator: Main orchestrator for image generation
 * - ImageStorage: Local file management with cleanup
 * - PhotosLibrary: macOS Photos.app integration
 */

// Main orchestrator
export {
  ImageGenerator,
  createImageGenerator,
  type ImageGeneratorConfig,
  type ImageGenerationOptions,
  type ImageGenerationResult
} from './ImageGenerator.js';

// Local storage management
export {
  ImageStorage,
  createImageStorage,
  type ImageStorageConfig,
  type SavedImage,
  type StorageStats
} from './ImageStorage.js';

// Photos.app integration
export {
  PhotosLibrary,
  createPhotosLibrary,
  type PhotosLibraryConfig,
  type ImportResult
} from './PhotosLibrary.js';
