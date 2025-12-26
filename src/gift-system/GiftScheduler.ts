/**
 * GiftScheduler - Daily message scheduling orchestrator
 *
 * Features:
 * - Schedule daily messages for each family member
 * - Timezone-aware scheduling with node-schedule
 * - Manual trigger for testing
 * - Preview mode (dry run)
 * - Graceful shutdown
 */

import schedule, { Job } from 'node-schedule';
import {
  FamilyMember,
  DailyGiftResult,
  GiftSystemConfig,
  GeneratedContent,
  ScheduledJobStatus,
  SchedulerStats,
  ContentGenerator
} from './types.js';
import { ProfileLoader } from './config/ProfileLoader.js';
import MessageService from '../services/MessageService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GiftScheduler');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for manual trigger
 */
export interface ManualTriggerOptions {
  /** Override dry run setting */
  dryRun?: boolean;
  /** Skip image generation */
  skipImage?: boolean;
  /** Skip web search */
  skipWebSearch?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GIFT SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GiftScheduler - Orchestrates scheduled daily messages
 */
export class GiftScheduler {
  private jobs: Map<string, Job> = new Map();
  private generator: ContentGenerator;
  private profileLoader: ProfileLoader;
  private messageService: MessageService;
  private config: GiftSystemConfig;
  private startedAt: Date | null = null;
  private messagesSentToday: number = 0;
  private errorsToday: number = 0;
  private lastResults: Map<string, DailyGiftResult> = new Map();

  constructor(
    generator: ContentGenerator,
    profileLoader: ProfileLoader,
    messageService: MessageService,
    config: GiftSystemConfig
  ) {
    this.generator = generator;
    this.profileLoader = profileLoader;
    this.messageService = messageService;
    this.config = config;

    logger.debug('GiftScheduler constructed', {
      dryRun: config.dryRun,
      testRecipient: config.testRecipient ?? 'none'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Start the scheduler - schedules jobs for all enabled family members
   */
  async start(): Promise<void> {
    if (this.startedAt) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info('Starting gift scheduler');

    try {
      // Initialize generator
      if (!this.generator.isInitialized()) {
        await this.generator.initialize();
      }

      // Load enabled family members
      const members = await this.profileLoader.getEnabledMembers();
      logger.info('Loaded family members', { count: members.length });

      // Schedule each member
      for (const member of members) {
        this.scheduleForMember(member);
      }

      this.startedAt = new Date();
      this.resetDailyCounters();

      logger.info('Gift scheduler started successfully', {
        jobCount: this.jobs.size,
        dryRun: this.config.dryRun,
        nextRuns: this.getStatus().map(s => `${s.memberName}: ${s.nextRun ?? 'none'}`)
      });

    } catch (error) {
      logger.error('Failed to start scheduler', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Stop the scheduler - cancels all scheduled jobs
   */
  shutdown(): void {
    logger.info('Shutting down gift scheduler', { jobCount: this.jobs.size });

    for (const [id, job] of this.jobs) {
      job.cancel();
      logger.debug('Cancelled job', { memberId: id });
    }

    this.jobs.clear();
    this.startedAt = null;

    logger.info('Gift scheduler shutdown complete');
  }

  /**
   * Manually trigger a gift for a specific member
   */
  async triggerManual(
    memberId: string,
    options: ManualTriggerOptions = {}
  ): Promise<DailyGiftResult> {
    const correlationId = logger.generateCorrelationId();

    logger.info('Manual trigger requested', {
      memberId,
      options,
      correlationId
    });

    try {
      const member = await this.profileLoader.getMember(memberId);
      if (!member) {
        throw new Error(`Member not found: ${memberId}`);
      }

      // Temporarily override dry run if specified
      const originalDryRun = this.config.dryRun;
      if (options.dryRun !== undefined) {
        this.config.dryRun = options.dryRun;
      }

      try {
        return await this.sendDailyGift(member, {
          skipImageGeneration: options.skipImage,
          skipWebSearch: options.skipWebSearch
        });
      } finally {
        this.config.dryRun = originalDryRun;
      }

    } catch (error) {
      logger.error('Manual trigger failed', {
        error: error instanceof Error ? error.message : String(error),
        memberId,
        correlationId
      });
      throw error;
    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Preview what would be sent (always dry run)
   */
  async preview(memberId: string): Promise<DailyGiftResult> {
    return this.triggerManual(memberId, { dryRun: true });
  }

  /**
   * Get next scheduled time for a member
   */
  getNextScheduledTime(memberId: string): Date | null {
    const job = this.jobs.get(memberId);
    return job?.nextInvocation() ?? null;
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus(): ScheduledJobStatus[] {
    const status: ScheduledJobStatus[] = [];

    for (const [memberId, job] of this.jobs) {
      const lastResult = this.lastResults.get(memberId);

      status.push({
        memberId,
        memberName: lastResult?.memberName ?? memberId,
        sendTime: '', // Will be filled from member data
        timezone: '',
        nextRun: job.nextInvocation() ?? null,
        lastRun: lastResult ? {
          time: lastResult.sentTime,
          success: lastResult.success,
          theme: lastResult.theme,
          error: lastResult.error
        } : undefined
      });
    }

    return status;
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      totalJobs: this.jobs.size,
      activeJobs: this.jobs.size,
      messagesSentToday: this.messagesSentToday,
      errorsToday: this.errorsToday,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      startedAt: this.startedAt ?? new Date()
    };
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.startedAt !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Schedule a job for a family member
   */
  private scheduleForMember(member: FamilyMember): void {
    const [hour, minute] = member.sendTime.split(':').map(Number);

    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = member.timezone;

    const job = schedule.scheduleJob(rule, async () => {
      await this.sendDailyGift(member);
    });

    if (job) {
      this.jobs.set(member.id, job);

      const nextRun = job.nextInvocation();
      logger.info('Scheduled member', {
        memberId: member.id,
        memberName: member.name,
        time: member.sendTime,
        timezone: member.timezone,
        nextRun: nextRun?.toLocaleString()
      });
    } else {
      logger.error('Failed to schedule member', {
        memberId: member.id,
        time: member.sendTime,
        timezone: member.timezone
      });
    }
  }

  /**
   * Send the daily gift to a member
   */
  private async sendDailyGift(
    member: FamilyMember,
    options: { skipImageGeneration?: boolean; skipWebSearch?: boolean } = {}
  ): Promise<DailyGiftResult> {
    const now = new Date();
    const correlationId = logger.generateCorrelationId();

    logger.info('Generating daily gift', {
      memberId: member.id,
      memberName: member.name,
      correlationId
    });

    try {
      // Generate content
      const content = await this.generator.generateContent(member, {
        skipImageGeneration: options.skipImageGeneration,
        skipWebSearch: options.skipWebSearch
      });

      // Dry run mode - log instead of send
      if (this.config.dryRun) {
        logger.info('DRY RUN - Would send message', {
          to: member.name,
          phone: member.phone,
          textPreview: content.text.substring(0, 100) + (content.text.length > 100 ? '...' : ''),
          hasImage: !!content.image,
          model: content.model,
          fallbackUsed: content.fallbackUsed,
          correlationId
        });

        const result = this.createSuccessResult(member, now, 'daily', content);
        this.lastResults.set(member.id, result);
        this.messagesSentToday++;
        return result;
      }

      // Determine recipient (test override or actual)
      const recipient = this.config.testRecipient || member.phone;

      // Send the message
      let sendResult;
      if (content.image) {
        sendResult = await this.messageService.sendMediaMessage(
          recipient,
          content.text,
          content.image.localPath
        );
      } else {
        sendResult = await this.messageService.sendTextMessage(
          recipient,
          content.text
        );
      }

      if (!sendResult.success) {
        throw new Error(sendResult.error ?? 'Message send failed');
      }

      logger.info('Gift sent successfully', {
        memberId: member.id,
        memberName: member.name,
        hasImage: !!content.image,
        model: content.model,
        fallbackUsed: content.fallbackUsed,
        toolsUsed: content.toolsInvoked,
        correlationId
      });

      const result = this.createSuccessResult(member, now, 'daily', content, sendResult.deliveryStatus);
      this.lastResults.set(member.id, result);
      this.messagesSentToday++;
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to send daily gift', {
        error: errorMessage,
        memberId: member.id,
        memberName: member.name,
        correlationId
      });

      const result = this.createFailedResult(member, now, 'daily', errorMessage);
      this.lastResults.set(member.id, result);
      this.errorsToday++;
      return result;

    } finally {
      logger.clearCorrelationId();
    }
  }

  /**
   * Create a success result
   */
  private createSuccessResult(
    member: FamilyMember,
    scheduledTime: Date,
    theme: string,
    content: GeneratedContent,
    deliveryStatus?: string
  ): DailyGiftResult {
    return {
      familyMemberId: member.id,
      memberName: member.name,
      scheduledTime,
      sentTime: new Date(),
      theme,
      content,
      success: true,
      deliveryStatus: (deliveryStatus as DailyGiftResult['deliveryStatus']) ?? 'unknown'
    };
  }

  /**
   * Create a failed result
   */
  private createFailedResult(
    member: FamilyMember,
    scheduledTime: Date,
    theme: string,
    error: string
  ): DailyGiftResult {
    return {
      familyMemberId: member.id,
      memberName: member.name,
      scheduledTime,
      sentTime: new Date(),
      theme,
      content: {
        text: '',
        model: '',
        tokensUsed: 0,
        toolsInvoked: [],
        fallbackUsed: false
      },
      success: false,
      error
    };
  }

  /**
   * Reset daily counters (called at midnight or start)
   */
  private resetDailyCounters(): void {
    this.messagesSentToday = 0;
    this.errorsToday = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a GiftScheduler instance
 */
export function createGiftScheduler(
  generator: ContentGenerator,
  profileLoader: ProfileLoader,
  messageService: MessageService,
  config: GiftSystemConfig
): GiftScheduler {
  return new GiftScheduler(generator, profileLoader, messageService, config);
}

export default GiftScheduler;
