import logger from './logger.js';

/**
 * Service configuration
 */
interface ServiceConfig {
    factory: (container: ServiceContainer) => unknown;
    singleton: boolean;
}

/**
 * Service with optional initialization
 */
interface InitializableService {
    initialize?: () => Promise<void>;
    cleanup?: () => Promise<void>;
    getStats?: () => unknown;
    isEnabled?: () => boolean;
}

/**
 * Health status entry
 */
interface HealthStatusEntry {
    error?: string;
    enabled?: boolean;
    initialized?: boolean;
    [key: string]: unknown;
}

/**
 * Dependency Injection Container
 * Manages service lifecycle and dependencies
 */
class ServiceContainer {
    private services: Map<string, unknown>;
    private factories: Map<string, ServiceConfig>;
    private singletons: Map<string, unknown>;
    private initializing: Set<string>;

    constructor() {
        this.services = new Map();
        this.factories = new Map();
        this.singletons = new Map();
        this.initializing = new Set();
    }

    /**
     * Register a service factory
     */
    register(name: string, factory: (container: ServiceContainer) => unknown, singleton: boolean = true): void {
        if (this.factories.has(name)) {
            logger.warn(`Service ${name} is already registered. Overwriting.`);
        }

        this.factories.set(name, { factory, singleton });
        logger.debug(`Registered service: ${name} (singleton: ${singleton})`);
    }

    /**
     * Register a singleton instance directly
     */
    registerInstance(name: string, instance: unknown): void {
        this.singletons.set(name, instance);
        logger.debug(`Registered singleton instance: ${name}`);
    }

    /**
     * Get service instance
     */
    get<T = unknown>(name: string): T {
        // Check if singleton instance exists
        if (this.singletons.has(name)) {
            return this.singletons.get(name) as T;
        }

        // Get factory
        const serviceConfig = this.factories.get(name);
        if (!serviceConfig) {
            throw new Error(`Service not found: ${name}`);
        }

        const { factory, singleton } = serviceConfig;

        // Check for circular dependencies
        if (this.initializing.has(name)) {
            throw new Error(`Circular dependency detected: ${name}`);
        }

        try {
            this.initializing.add(name);

            // Create instance
            const instance = factory(this);

            if (singleton) {
                this.singletons.set(name, instance);
            }

            return instance as T;
        } finally {
            this.initializing.delete(name);
        }
    }

    /**
     * Check if service is registered
     */
    has(name: string): boolean {
        return this.factories.has(name) || this.singletons.has(name);
    }

    /**
     * Get all registered service names
     */
    getServiceNames(): string[] {
        const names = new Set([
            ...this.factories.keys(),
            ...this.singletons.keys()
        ]);
        return Array.from(names);
    }

    /**
     * Clear all services
     */
    clear(): void {
        this.services.clear();
        this.factories.clear();
        this.singletons.clear();
        this.initializing.clear();
    }

    /**
     * Initialize all singleton services
     */
    async initializeAll(): Promise<void> {
        logger.info('Initializing all services...');

        for (const [name, config] of this.factories.entries()) {
            if (config.singleton && !this.singletons.has(name)) {
                try {
                    const instance = this.get<InitializableService>(name);
                    if (instance && typeof instance.initialize === 'function') {
                        await instance.initialize();
                        logger.debug(`Initialized service: ${name}`);
                    }
                } catch (error) {
                    logger.error(`Failed to initialize service ${name}:`, { error: error as Error });
                    throw error;
                }
            }
        }

        logger.info('All services initialized');
    }

    /**
     * Cleanup all services
     */
    async cleanup(): Promise<void> {
        logger.info('Cleaning up services...');

        for (const [name, instance] of this.singletons.entries()) {
            const service = instance as InitializableService;
            if (service && typeof service.cleanup === 'function') {
                try {
                    await service.cleanup();
                    logger.debug(`Cleaned up service: ${name}`);
                } catch (error) {
                    logger.error(`Error cleaning up service ${name}:`, { error: error as Error });
                }
            }
        }

        this.clear();
        logger.info('All services cleaned up');
    }

    /**
     * Get service health status
     */
    async getHealthStatus(): Promise<Record<string, HealthStatusEntry>> {
        const status: Record<string, HealthStatusEntry> = {};

        for (const [name, instance] of this.singletons.entries()) {
            const service = instance as InitializableService;
            if (service && typeof service.getStats === 'function') {
                try {
                    status[name] = service.getStats() as HealthStatusEntry;
                } catch (error) {
                    const err = error as Error;
                    status[name] = { error: err.message };
                }
            } else if (service && typeof service.isEnabled === 'function') {
                status[name] = { enabled: service.isEnabled() };
            } else {
                status[name] = { initialized: true };
            }
        }

        return status;
    }
}

export default new ServiceContainer();
