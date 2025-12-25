import { spawnSync, SpawnSyncReturns } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from './logger.js';
import type { HardwareInfo } from '../types/socket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../../config/mac-id.json');
const CONFIG_DIR = dirname(CONFIG_PATH);

interface MacIdConfig {
    macId: string;
    generatedAt: string;
    hardwareInfo: HardwareInfo;
}

interface BasicHardwareInfo {
    hostname: string;
    model: string;
    os: string;
}

class MacIdentifier {
    private macId: string | null;

    constructor() {
        this.macId = null;
        this.ensureConfigDir();
    }

    ensureConfigDir(): void {
        try {
            if (!existsSync(CONFIG_DIR)) {
                mkdirSync(CONFIG_DIR, { recursive: true });
            }
        } catch (error) {
            logger.error('Failed to create config directory:', { error: error as Error });
        }
    }

    /**
     * Get or generate a unique Mac identifier
     */
    getMacId(): string {
        if (this.macId) {
            return this.macId;
        }

        // Try to load existing ID from config
        const existingId = this.loadExistingId();
        if (existingId) {
            this.macId = existingId;
            return this.macId;
        }

        // Generate new ID based on hardware info
        this.macId = this.generateNewId();
        this.saveId(this.macId);

        return this.macId;
    }

    /**
     * Load existing Mac ID from config file
     */
    private loadExistingId(): string | null {
        try {
            if (existsSync(CONFIG_PATH)) {
                const configData = readFileSync(CONFIG_PATH, 'utf8');
                const config = JSON.parse(configData) as MacIdConfig;
                if (config.macId) {
                    logger.info('Loaded existing Mac ID from config');
                    return config.macId;
                }
            }
        } catch (error) {
            const err = error as Error;
            logger.warn('Failed to load existing Mac ID:', { error: err.message });
        }
        return null;
    }

    /**
     * Generate new unique Mac ID based on hardware info
     */
    private generateNewId(): string {
        try {
            // Get hardware serial number
            let serial = 'unknown-serial';
            try {
                const result = spawnSync('system_profiler', ['SPHardwareDataType'], {
                    encoding: 'utf8',
                    shell: false
                }) as SpawnSyncReturns<string>;

                if (result.status === 0 && result.stdout) {
                    const match = result.stdout.match(/Serial Number[^:]*:\s*(\S+)/);
                    if (match) {
                        serial = match[1].trim();
                    }
                }
            } catch (error) {
                const err = error as Error;
                logger.warn('Could not get serial number:', { error: err.message });
            }

            // Get primary network interface MAC address
            let macAddress = 'unknown-mac';
            try {
                const result = spawnSync('ifconfig', ['en0'], {
                    encoding: 'utf8',
                    shell: false
                }) as SpawnSyncReturns<string>;

                if (result.status === 0 && result.stdout) {
                    const match = result.stdout.match(/ether\s+([0-9a-f:]+)/i);
                    if (match) {
                        macAddress = match[1].trim();
                    }
                }
            } catch (error) {
                const err = error as Error;
                logger.warn('Could not get MAC address:', { error: err.message });
            }

            // Get system UUID
            let systemUuid = 'unknown-uuid';
            try {
                const result = spawnSync('system_profiler', ['SPHardwareDataType'], {
                    encoding: 'utf8',
                    shell: false
                }) as SpawnSyncReturns<string>;

                if (result.status === 0 && result.stdout) {
                    const match = result.stdout.match(/Hardware UUID[^:]*:\s*(\S+)/);
                    if (match) {
                        systemUuid = match[1].trim();
                    }
                }
            } catch (error) {
                const err = error as Error;
                logger.warn('Could not get system UUID:', { error: err.message });
            }

            // Create unique identifier by combining hardware info
            const hardwareString = `${serial}-${macAddress}-${systemUuid}`;
            const macId = crypto.createHash('sha256')
                .update(hardwareString)
                .digest('hex')
                .substring(0, 16);

            logger.info('Generated new Mac ID based on hardware info');
            return `mac_${macId}`;

        } catch (error) {
            logger.error('Failed to generate Mac ID from hardware:', { error: error as Error });
            // Fallback to random ID with timestamp
            const fallbackId = crypto.randomBytes(8).toString('hex');
            logger.warn(`Using fallback Mac ID: mac_${fallbackId}`);
            return `mac_${fallbackId}`;
        }
    }

    /**
     * Save Mac ID to config file
     */
    private saveId(macId: string): void {
        try {
            const config: MacIdConfig = {
                macId,
                generatedAt: new Date().toISOString(),
                hardwareInfo: this.getRegistrationInfo()
            };

            writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
            logger.info(`Mac ID saved to ${CONFIG_PATH}`);

        } catch (error) {
            logger.error('Failed to save Mac ID:', { error: error as Error });
        }
    }

    /**
     * Get basic hardware info for reference
     */
    private getHardwareInfo(): BasicHardwareInfo {
        const info: BasicHardwareInfo = {
            hostname: 'unknown',
            model: 'unknown',
            os: 'unknown'
        };

        try {
            const result = spawnSync('hostname', [], { encoding: 'utf8', shell: false }) as SpawnSyncReturns<string>;
            info.hostname = (result.status === 0 && result.stdout) ? result.stdout.trim() : 'unknown';
        } catch (error) {
            info.hostname = 'unknown';
        }

        try {
            const result = spawnSync('system_profiler', ['SPHardwareDataType'], {
                encoding: 'utf8',
                shell: false
            }) as SpawnSyncReturns<string>;

            if (result.status === 0 && result.stdout) {
                const match = result.stdout.match(/Model Name[^:]*:\s*(.+)/);
                info.model = match ? match[1].trim() : 'unknown';
            } else {
                info.model = 'unknown';
            }
        } catch (error) {
            info.model = 'unknown';
        }

        try {
            const result = spawnSync('sw_vers', ['-productVersion'], {
                encoding: 'utf8',
                shell: false
            }) as SpawnSyncReturns<string>;

            info.os = (result.status === 0 && result.stdout) ? result.stdout.trim() : 'unknown';
        } catch (error) {
            info.os = 'unknown';
        }

        return info;
    }

    /**
     * Get hardware info for registration with server
     */
    getRegistrationInfo(): HardwareInfo {
        const basicInfo = this.getHardwareInfo();
        return {
            macId: this.getMacId(),
            serialNumber: 'unknown',  // Not exposed separately
            model: basicInfo.model,
            osVersion: basicInfo.os,
            hostname: basicInfo.hostname
        };
    }

    /**
     * Reset Mac ID (generates new one)
     */
    resetId(): void {
        try {
            if (existsSync(CONFIG_PATH)) {
                unlinkSync(CONFIG_PATH);
            }
            this.macId = null;
            logger.info('Mac ID reset, will generate new one on next getMacId() call');
        } catch (error) {
            logger.error('Failed to reset Mac ID:', { error: error as Error });
        }
    }
}

export default new MacIdentifier();
