import { kafkaService } from '../../utils/kafka.util';
import { logger } from '../../utils/logger';
import config from '../../config/env';
import {
  KafkaHealthStatus,
  ErrorEvent,
} from '../../types/kafka.types';

export class KafkaConsumerService {
  private isRunning = false;
  private consumers: Map<string, any> = new Map();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  /**
   * Initialize all Kafka consumers
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Kafka consumer service...');
      
      // Validate Kafka connection first
      const isConnected = await kafkaService.validateConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Kafka cluster');
      }
      
      // Set up consumers in parallel for better performance
      const setupPromises = [
        this.setupFhirEventConsumer(),
        this.setupErrorEventConsumer(),
      ];

      await Promise.allSettled(setupPromises);

      this.isRunning = true;
      logger.info('Kafka consumer service initialized successfully', {
        consumers: Array.from(this.consumers.keys()),
        isConnected: kafkaService.isServiceConnected()
      });
    } catch (error) {
      logger.error('Failed to initialize Kafka consumer service:', error);
      await this.cleanup();
      throw error;
    }
  }


  /**
   * Set up FHIR event consumer
   */
  private async setupFhirEventConsumer(): Promise<void> {
    try {
      const topic = config.KAFKA.TOPICS.FHIR_EVENTS;
      const groupId = `${config.KAFKA.GROUP_ID}-fhir`;

      if (!topic) {
        logger.warn('FHIR_EVENTS topic not configured, skipping consumer setup');
        return;
      }

      logger.info(`Setting up FHIR event consumer`, {
        topic,
        groupId,
        brokers: config.KAFKA.BROKERS
      });

      // Check if topic exists
      try {
        const metadata = await kafkaService.getTopicMetadata(topic);
        logger.info(`Topic ${topic} metadata retrieved`, { metadata });
      } catch (error) {
        logger.warn(`Topic ${topic} may not exist or is not accessible`, { error: error instanceof Error ? error.message : String(error) });
      }

      await kafkaService.subscribeToTopic(
        topic,
        groupId,
        this.handleFhirEvent.bind(this)
      );

      this.consumers.set('fhir-events', { topic, groupId });
      logger.info(`FHIR event consumer set up successfully for topic: ${topic}`, { groupId });
    } catch (error) {
      logger.error('Failed to set up FHIR event consumer:', error);
      throw error;
    }
  }

  /**
   * Set up error event consumer
   */
  private async setupErrorEventConsumer(): Promise<void> {
    try {
      // Check if ERROR_EVENTS topic is configured
      const topic = (config.KAFKA.TOPICS as any).ERROR_EVENTS;
      const groupId = `${config.KAFKA.GROUP_ID}-errors`;

      if (!topic) {
        logger.info('ERROR_EVENTS topic not configured, skipping consumer setup');
        return;
      }

      await kafkaService.subscribeToTopic(
        topic,
        groupId,
        this.handleErrorEvent.bind(this)
      );

      this.consumers.set('error-events', { topic, groupId });
      logger.info(`Error event consumer set up for topic: ${topic}`, { groupId });
    } catch (error) {
      logger.error('Failed to set up error event consumer:', error);
      // Don't throw error for error consumer as it's optional
      logger.warn('Continuing without error event consumer');
    }
  }

  /**
   * Handle FHIR events with retry logic
   */
  private async handleFhirEvent(payload: any): Promise<void> {
    const startTime = Date.now();
    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      try {
        const message = kafkaService.parseMessage(payload);

        const event = kafkaService.parseEvent(payload) as any;
        console.log('event');
        console.log(event.body);
    
        const processingTime = Date.now() - startTime;
        logger.info('FHIR event processed successfully', {
          eventId: event.id,
          processingTimeMs: processingTime,
        });

        return; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        const isLastRetry = retryCount >= this.maxRetries;
        
        logger.error('Error processing FHIR event', {
          error: error instanceof Error ? error.message : String(error),
          retryCount,
          isLastRetry,
          eventId: payload?.value ? JSON.parse(payload.value.toString())?.id : 'unknown',
        });

        if (isLastRetry) {
          // Log final failure and potentially send to dead letter queue
          logger.error('Max retries exceeded for FHIR event', {
            eventId: payload?.value ? JSON.parse(payload.value.toString())?.id : 'unknown',
            finalError: error,
          });
          return;
        }

        // Wait before retry with exponential backoff
        await this.delay(this.retryDelay * Math.pow(2, retryCount - 1));
      }
    }
  }


  /**
   * Handle error events
   */
  private async handleErrorEvent(payload: any): Promise<void> {
    try {
      const message = kafkaService.parseMessage(payload);
      const event = kafkaService.parseEvent(payload) as ErrorEvent;
      
      logger.error('Processing error event', {
        eventId: event.id,
        errorType: event.type,
        errorCode: event.data.errorCode,
        severity: event.data.severity,
        errorMessage: event.data.errorMessage,
        topic: message.topic,
        partition: message.partition,
        offset: message.offset,
      });

      // Process error event based on severity
      await this.processErrorEvent(event);
    } catch (error) {
      logger.error('Error processing error event:', error);
    }
  }

  /**
   * Process error event based on severity
   */
  private async processErrorEvent(event: ErrorEvent): Promise<void> {
    const { severity, errorCode, errorMessage, context } = event.data;

    switch (severity) {
      case 'critical':
        logger.error('Critical error detected', { errorCode, errorMessage, context });
        // TODO: Implement critical error handling (alerts, notifications)
        break;
      case 'high':
        logger.error('High severity error detected', { errorCode, errorMessage, context });
        // TODO: Implement high severity error handling
        break;
      case 'medium':
        logger.warn('Medium severity error detected', { errorCode, errorMessage, context });
        // TODO: Implement medium severity error handling
        break;
      case 'low':
        logger.info('Low severity error detected', { errorCode, errorMessage, context });
        // TODO: Implement low severity error handling
        break;
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      this.consumers.clear();
      this.isRunning = false;
      logger.info('Kafka consumer service cleaned up');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<KafkaHealthStatus> {
    try {
      const isConnected = kafkaService.isServiceConnected();
      const topics = Object.values(config.KAFKA.TOPICS);
      
      return {
        isConnected,
        brokers: config.KAFKA.BROKERS,
        topics,
        consumerGroups: Array.from(this.consumers.keys()),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        isConnected: false,
        brokers: config.KAFKA.BROKERS,
        topics: Object.values(config.KAFKA.TOPICS),
        consumerGroups: [],
        lastError: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Stop all consumers
   */
  async stop(): Promise<void> {
    try {
      logger.info('Stopping Kafka consumer service...');
      
      await kafkaService.disconnect();
      await this.cleanup();
      
      logger.info('Kafka consumer service stopped successfully');
    } catch (error) {
      logger.error('Error stopping Kafka consumer service:', error);
      await this.cleanup(); // Ensure cleanup even if disconnect fails
      throw error;
    }
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const kafkaConsumerService = new KafkaConsumerService();
