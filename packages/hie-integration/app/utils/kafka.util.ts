import { Kafka, Producer, Consumer, EachMessagePayload, Admin } from 'kafkajs';
import { logger } from './logger';
import config from '../config/env';

// Kafka event types
export interface KafkaEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  data: any;
  metadata?: {
    correlationId?: string;
    userId?: string;
    facilityId?: string;
    [key: string]: any;
  };
}

export interface KafkaMessage {
  topic: string;
  partition: number;
  offset: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
  timestamp: string;
}

export interface KafkaProducerConfig {
  transactionalId?: string;
  maxInFlightRequests?: number;
  idempotent?: boolean;
  retry?: {
    retries: number;
    initialRetryTime: number;
    maxRetryTime: number;
  };
}

export interface KafkaConsumerConfig {
  groupId: string;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  maxBytesPerPartition?: number;
  maxBytes?: number;
  maxWaitTimeInMs?: number;
}

export class KafkaService {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private admin: Admin | null = null;
  private isConnected = false;
  private kafkaConfig: { clientId: string; brokers: string[] };

  constructor() {
    this.kafkaConfig = {
      clientId: config.KAFKA.CLIENT_ID,
      brokers: config.KAFKA.BROKERS,
    };
    this.kafka = new Kafka(this.kafkaConfig);
  }


  /**
   * Create and return an admin instance
   */
  async getAdmin(): Promise<Admin> {
    if (!this.admin) {
      this.admin = this.kafka.admin();
      await this.admin.connect();
    }
    return this.admin;
  }

  /**
   * Create a consumer for a specific topic
   */
  async createConsumer(
    groupId: string,
    consumerConfig: KafkaConsumerConfig = { groupId }
  ): Promise<Consumer> {
    const kafkaConfig = {
      groupId,
      sessionTimeout: consumerConfig.sessionTimeout || 30000,
      heartbeatInterval: consumerConfig.heartbeatInterval || 3000,
      maxBytesPerPartition: consumerConfig.maxBytesPerPartition || 1048576,
      maxBytes: consumerConfig.maxBytes || 10485760,
      maxWaitTimeInMs: consumerConfig.maxWaitTimeInMs || 5000
    };

    const consumer = this.kafka.consumer(kafkaConfig);
    this.consumers.set(groupId, consumer);

    logger.info(`Created consumer for group: ${groupId}`, { kafkaConfig });
    return consumer;
  }

  /**
   * Subscribe to a topic and process messages
   */
  async subscribeToTopic(
    topic: string,
    groupId: string,
    messageHandler: (payload: EachMessagePayload) => Promise<void>,
    consumerConfig: KafkaConsumerConfig = { groupId }
  ): Promise<void> {
    try {
      logger.info(`Attempting to subscribe to topic: ${topic} with group: ${groupId}`, {
        brokers: this.kafkaConfig.brokers,
        clientId: this.kafkaConfig.clientId
      });

      const consumer = await this.createConsumer(groupId, consumerConfig);

      // Add error handlers
      consumer.on('consumer.connect', () => {
        logger.info(`Consumer connected for topic: ${topic}, group: ${groupId}`);
      });

      consumer.on('consumer.disconnect', () => {
        logger.warn(`Consumer disconnected for topic: ${topic}, group: ${groupId}`);
        this.isConnected = false;
      });

      consumer.on('consumer.stop', () => {
        logger.info(`Consumer stopped for topic: ${topic}, group: ${groupId}`);
      });

      consumer.on('consumer.crash', (error) => {
        logger.error(`Consumer crashed for topic: ${topic}, group: ${groupId}:`, error);
        this.isConnected = false;
      });

      await consumer.connect();

      // Set connection status
      this.isConnected = true;

      await consumer.subscribe({ topic, fromBeginning: true });

      await consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          try {
            logger.info(`Received message from topic ${topic}`, {
              topic: payload.topic,
              partition: payload.partition,
              offset: payload.message.offset,
              key: payload.message.key?.toString(),
              valueLength: payload.message.value?.length || 0,
              timestamp: payload.message.timestamp
            });
            await messageHandler(payload);
          } catch (error) {
            logger.error(`Error processing message from topic ${topic}:`, {
              error: error instanceof Error ? error.message : String(error),
              topic: payload.topic,
              partition: payload.partition,
              offset: payload.message.offset,
              stack: error instanceof Error ? error.stack : undefined
            });
            // You might want to implement dead letter queue logic here
          }
        },
      }),
        consumer.on('consumer.group_join', ({ payload }) => {
          logger.info('Consumer joined group', {
            groupId: payload.groupId,
            memberId: payload.memberId,
            memberAssignment: payload.memberAssignment
          });
        });

      logger.info(`Successfully subscribed to topic ${topic} with group ${groupId}`);
    } catch (error) {
      logger.error(`Failed to subscribe to topic ${topic}:`, {
        error: error instanceof Error ? error.message : String(error),
        topic,
        groupId,
        brokers: this.kafkaConfig.brokers,
        stack: error instanceof Error ? error.stack : undefined
      });
      this.isConnected = false;
      throw error;
    }
  }


  /**
   * Validate Kafka connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const admin = await this.getAdmin();
      const clusterInfo = await admin.describeCluster();

      logger.info('Kafka connection validated successfully', {
        clusterId: clusterInfo.clusterId,
        brokerCount: clusterInfo.brokers.length,
        brokers: clusterInfo.brokers.map((b: any) => `${b.host}:${b.port}`)
      });

      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error('Kafka connection validation failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Get topic metadata
   */
  async getTopicMetadata(topic: string): Promise<any> {
    try {
      const admin = await this.getAdmin();
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      return metadata;
    } catch (error) {
      logger.error(`Failed to get metadata for topic ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Parse Kafka message payload
   */
  parseMessage(payload: EachMessagePayload): KafkaMessage {
    const { topic, partition, message } = payload;
    return {
      topic,
      partition,
      offset: message.offset,
      key: message.key?.toString(),
      value: message.value?.toString() || '',
      headers: message.headers ? Object.fromEntries(
        Object.entries(message.headers).map(([key, value]) => [key, value?.toString() || ''])
      ) : {},
      timestamp: message.timestamp,
    };
  }

  /**
   * Parse Kafka event from message
   */
  parseEvent(payload: EachMessagePayload): KafkaEvent {
    const message = this.parseMessage(payload);
    logger.debug('Parsing Kafka event', {
      topic: message.topic,
      valueLength: message.value.length,
      valuePreview: message.value.substring(0, 200) + (message.value.length > 200 ? '...' : '')
    });

    try {
      const parsed = JSON.parse(message.value);
      logger.debug('Successfully parsed Kafka event', {
        eventId: parsed.id,
        eventType: parsed.type,
        hasBody: !!parsed.body
      });
      return parsed;
    } catch (error) {
      logger.error('Failed to parse Kafka event:', {
        error: error instanceof Error ? error.message : String(error),
        value: message.value,
        valueLength: message.value.length
      });
      throw new Error('Invalid message format');
    }
  }

  /**
   * Disconnect all consumers and producer
   */
  async disconnect(): Promise<void> {
    try {
      // Disconnect all consumers
      for (const [groupId, consumer] of this.consumers) {
        await consumer.disconnect();
        logger.info(`Disconnected consumer group: ${groupId}`);
      }
      this.consumers.clear();

      // Disconnect admin
      if (this.admin) {
        await this.admin.disconnect();
        this.admin = null;
        logger.info('Disconnected admin client');
      }

      this.isConnected = false;
      logger.info('Kafka service disconnected');
    } catch (error) {
      logger.error('Error disconnecting Kafka service:', error);
      throw error;
    }
  }

  /**
   * Check if Kafka service is connected
   */
  isServiceConnected(): boolean {
    return this.isConnected;
  }

}

// Singleton instance
export const kafkaService = new KafkaService();


export default kafkaService;
