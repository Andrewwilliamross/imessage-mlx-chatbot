/**
 * URL Validation Utility
 * Simple URL validation for the relay system
 */

export class UrlValidator {
    /**
     * Validate if a string is a valid URL
     */
    static isValidUrl(urlString: string): boolean {
        try {
            const url = new URL(urlString);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate if a URL is an image URL (basic check)
     */
    static isImageUrl(urlString: string): boolean {
        if (!this.isValidUrl(urlString)) {
            return false;
        }

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
        const lowercaseUrl = urlString.toLowerCase();

        return imageExtensions.some(ext => lowercaseUrl.includes(ext));
    }

    /**
     * Sanitize URL by removing potentially dangerous characters
     */
    static sanitizeUrl(urlString: string): string {
        if (!urlString || typeof urlString !== 'string') {
            return '';
        }

        // Remove any potential script injections
        return urlString
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .replace(/vbscript:/gi, '')
            .trim();
    }

    /**
     * Get file extension from URL
     */
    static getFileExtension(urlString: string): string {
        try {
            const url = new URL(urlString);
            const pathname = url.pathname;
            const lastDot = pathname.lastIndexOf('.');

            if (lastDot === -1) {
                return '';
            }

            return pathname.substring(lastDot);
        } catch (error) {
            return '';
        }
    }
}

export default UrlValidator;
