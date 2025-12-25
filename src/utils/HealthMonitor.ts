/**
 * Health monitoring for chatbot services
 */

import logger from './logger.js';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  details?: Record<string, unknown>;
}

export class HealthMonitor {
  private services: Map<string, ServiceHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private checks: Map<string, () => Promise<boolean>> = new Map();

  /**
   * Register a health check function for a service
   */
  registerCheck(serviceName: string, checkFn: () => Promise<boolean>): void {
    this.checks.set(serviceName, checkFn);
    this.services.set(serviceName, {
      name: serviceName,
      status: 'healthy',
      lastCheck: new Date(),
    });
  }

  /**
   * Start periodic health checks
   */
  start(intervalMs: number = 30000): void {
    this.checkInterval = setInterval(() => this.runChecks(), intervalMs);
    this.runChecks(); // Run immediately
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<void> {
    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const healthy = await checkFn();
        this.services.set(name, {
          name,
          status: healthy ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
        });
      } catch (error) {
        logger.error(`Health check failed for ${name}`, { error });
        this.services.set(name, {
          name,
          status: 'unhealthy',
          lastCheck: new Date(),
          details: { error: String(error) },
        });
      }
    }
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): {
    status: 'healthy' | 'unhealthy' | 'degraded';
    services: ServiceHealth[];
  } {
    const services = Array.from(this.services.values());
    const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;

    let status: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyCount === 0) {
      status = 'healthy';
    } else if (unhealthyCount === services.length) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return { status, services };
  }
}

export default HealthMonitor;
