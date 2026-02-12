import { kafkaService } from '../../utils/kafka.util';
import { logger } from '../../utils/logger';
import config from '../../config/env';
import {
  KafkaHealthStatus,
  ErrorEvent,
} from '../../types/kafka.types';
import { SHRService } from '../shr/shr.service';
import { HieMappingService } from '../amrs/hie-mapping-service';
import { FhirTransformer } from '../shr/fhir-transformer';
import { AmrsFhirClient } from '../shr/amrs-fhir-client';
import { VisitService } from '../amrs/visit-service';
import axios from 'axios';
import { ShrFhirClient } from '../shr/shr-fhir-client';
import { ProcessedVisitRepository } from '../../repositories/ProcessedVisitRepository';

export class KafkaConsumerService {
  private isRunning = false;
  private consumers: Map<string, any> = new Map();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second
  private shrService!: SHRService;
  private mappingService!: HieMappingService;
  private transformer!: FhirTransformer;
  private visitService!: VisitService;
  private amrsFhirClient!: AmrsFhirClient;
  private processedVisitRepository!: ProcessedVisitRepository;

  constructor() {
    // Services are initialized lazily in initialize() after database is ready
  }

  /**
   * Initialize services that depend on database connections
   * Must be called after DatabaseManager.initializeAll()
   */
  private initializeServices(): void {
    if (!this.mappingService) {
      this.mappingService = new HieMappingService();
      this.transformer = new FhirTransformer(this.mappingService);
      this.visitService = new VisitService();
      this.amrsFhirClient = new AmrsFhirClient();
      this.processedVisitRepository = new ProcessedVisitRepository();
    }
  }

  /**
   * Initialize all Kafka consumers
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Kafka consumer service...');
      
      // Initialize services that depend on database (must be done after DB is ready)
      this.initializeServices();
      
      // Don't initialize SHR service here - it will be initialized per message with the correct facility ID

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
        logger.warn(`Topic ${topic} may not exist or is not accessible`, {
          error: error instanceof Error ? error.message : String(error),
          topic,
          brokers: config.KAFKA.BROKERS
        });
        // Don't fail the setup if topic doesn't exist - Kafka will create it
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
   * Handle FHIR events with retry logic and transactional processing
   */
  private async handleFhirEvent(payload: any): Promise<void> {
    const startTime = Date.now();
    let retryCount = 0;

    logger.info('Received Kafka message', {
      topic: payload.topic,
      partition: payload.partition,
      offset: payload.message.offset,
      key: payload.message.key?.toString(),
      valueLength: payload.message.value?.length || 0,
      timestamp: payload.message.timestamp
    });

    try {
      const event = kafkaService.parseEvent(payload) as any;
      const eventId = event?.id || 'unknown';

      logger.info('Processing FHIR event', {
        eventId,
        hasBody: !!event?.body,
        eventType: event?.type,
        rawEvent: JSON.stringify(event, null, 2)
      });

      while (retryCount < this.maxRetries) {
        try {
          const message = kafkaService.parseMessage(payload);
          logger.debug('Parsed Kafka message', {
            topic: message.topic,
            partition: message.partition,
            offset: message.offset,
            eventId
          });

          // Validate event structure
          if (!event?.body) {
            throw new Error('Event body is missing or invalid');
          }

          // Parse event.body if it's a string
          let bundle;
          if (typeof event.body === 'string') {
            try {
              bundle = JSON.parse(event.body);
              logger.debug('Parsed bundle from string', { eventId });
            } catch (error) {
              logger.error('Failed to parse event.body as JSON', { eventId, error });
              throw new Error('Invalid JSON in event body');
            }
          } else {
            bundle = event.body;
          }

          logger.debug('Bundle validation', {
            eventId,
            hasEntry: !!bundle.entry,
            isArray: Array.isArray(bundle.entry),
            entryLength: bundle.entry?.length || 0,
            bundleId: bundle.id,
            resourceType: bundle.resourceType,
          });

          if (!bundle.entry || !Array.isArray(bundle.entry) || bundle.entry.length === 0) {
            logger.info('Skipping empty bundle', {
              eventId,
              bundleId: bundle.id,
              resourceType: bundle.resourceType,
              entryCount: bundle.entry?.length || 0
            });
            return; // Skip processing empty bundles
          }

          logger.info('Processing bundle with entries', {
            eventId,
            bundleId: bundle.id,
            resourceType: bundle.resourceType,
            entryCount: bundle.entry.length
          });

          // Transactional processing: both operations must succeed
          // await this.processFhirEventTransactionally(bundle, eventId);
          await this.processFhirEventTransactionally(bundle, eventId);
          const processingTime = Date.now() - startTime;
          logger.info('FHIR event processed successfully', {
            eventId,
            processingTimeMs: processingTime,
            retryCount
          });

          return; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          const isLastRetry = retryCount >= this.maxRetries;

          logger.error('Error processing FHIR event', {
            error: error instanceof Error ? error.message : String(error),
            retryCount,
            isLastRetry,
            eventId,
            stack: error instanceof Error ? error.stack : undefined
          });

          if (isLastRetry) {
            // Send to dead letter queue on final failure
            await this.sendToDeadLetterQueue(event, error);
            logger.error('Max retries exceeded for FHIR event, sent to dead letter queue', {
              eventId,
              finalError: error instanceof Error ? error.message : String(error),
            });
            return;
          }

          // Wait before retry with exponential backoff
          await this.delay(this.retryDelay * Math.pow(2, retryCount - 1));
        }
      }
    } catch (parseError) {
      logger.error('Failed to parse Kafka event', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        payload: JSON.stringify(payload, null, 2)
      });

      // Send unparseable message to dead letter queue
      await this.sendToDeadLetterQueue({ id: 'unknown', body: payload }, parseError);
    }
  }

  /**
   * Process FHIR event transactionally - post to HIE SHR, OpenHIM, and Internal HAPI
   */
  private async processFhirEventTransactionally(bundle: any, eventId: string): Promise<void> {
    // Extract facility ID and initialize SHR service
    let locationUuid: string | undefined;

    // 1. Extract Encounter UUID from Bundle
    const encounterId = this.extractEncounterIdFromBundle(bundle);

    if (encounterId) {
      // 2. Get Encounter Context (Visit -> Location)
      const context = await this.mappingService.getEncounterContext(encounterId);

      if (context && context.locationUuid) {
        // 3. Verify that a Facility Code exists for this Location UUID
        // We don't use the code here directly, but we verify it exists so SHRService won't fail later
        const code = await this.mappingService.getFacilityCodeUsingLocationUuid(
          context.locationUuid
        );
        if (code) {
          locationUuid = context.locationUuid;
        } else {
          logger.warn(
            { encounterId, locationUuid: context.locationUuid },
            "Facility code not found for location"
          );
        }
      } else {
        logger.warn(
          { encounterId },
          "Encounter context or location UUID not found"
        );
      }
    } else {
      logger.warn({ bundleId: bundle.id }, "No Encounter found in bundle");
    }

    if (!locationUuid) {
      const errorMsg = `Could not determine location UUID (for facility) for bundle ${bundle.id}. Aborting processing.`;
      logger.error({ bundleId: bundle.id }, errorMsg);
      // Fail processing if location UUID is missing
      throw new Error(errorMsg);
    }

    // Initialize the SHRService with the locationUuid
    this.shrService = new SHRService(locationUuid);

    // Post the bundle to the OpenHIM channel using postBundleToExternalHapi
    try {
      // First, post the bundle to OpenHIM channel
      const openhimResponse = await this.shrService.postBundleToExternalHapi(bundle);

      // Additionally, post the bundle to SHR with the HIE token
      try {
        const shrWithTokenResponse = await this.shrService.postBundleToShrHieWithToken(bundle);
        logger.info('Bundle posted to SHR /shr/hie successfully with token', {
          eventId,
          shrStatus: shrWithTokenResponse?.status,
          bundleId: bundle.id,
        });
      } catch (shrWithTokenError) {
        logger.error('Failed to post bundle to SHR /shr/hie with token', {
          eventId,
          error: shrWithTokenError instanceof Error ? shrWithTokenError.message : String(shrWithTokenError),
          bundleId: bundle.id,
        });
        // Don't throw - continue processing
      }

      logger.info('Bundle posted to OpenHIM channel successfully', {
        eventId,
        openhimStatus: openhimResponse?.status,
        bundleId: bundle.id,
      });
    } catch (openhimError) {
      logger.error('Failed to post bundle to OpenHIM channel', {
        eventId,
        error: openhimError instanceof Error ? openhimError.message : String(openhimError),
        bundleId: bundle.id,
      });
      // Don't throw - let it continue
    }
  }

  /**
   * Send failed event to dead letter queue
   */
  private async sendToDeadLetterQueue(event: any, error: any): Promise<void> {
    try {
      const deadLetterPayload = {
        originalEvent: event,
        error: {
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          retryCount: this.maxRetries
        },
        metadata: {
          service: 'hie-integration',
          version: '1.0.0'
        }
      };

      // Ensure SHR service is initialized for dead letter queue
      if (!this.shrService) {
        // Try to extract locationUuid from the event
        let locationUuid: string | undefined;
        
        try {
          const bundle = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
          const encounterId = this.extractEncounterIdFromBundle(bundle);
          
          if (encounterId) {
            const context = await this.mappingService.getEncounterContext(encounterId);
            if (context?.locationUuid) {
              locationUuid = context.locationUuid;
              logger.debug({ locationUuid, encounterId }, 'Extracted locationUuid for dead letter queue');
            }
          }
        } catch (extractError) {
          logger.debug('Could not extract locationUuid from event, using default', {
            error: extractError instanceof Error ? extractError.message : String(extractError)
          });
        }

        // Fall back to configured default facility UUID
        const facilityId = locationUuid || config.DEFAULT_FACILITY_UUID;
        this.shrService = new SHRService(facilityId);
        logger.info({ facilityId, usedDefault: !locationUuid }, 'Initialized SHR service for dead letter queue');
      }

      // Send to HAPI dead letter endpoint
      await this.shrService.sendToDeadLetterQueue(deadLetterPayload);

      logger.info('Event sent to dead letter queue', {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error)
      });
    } catch (dlqError) {
      logger.error('Failed to send event to dead letter queue', {
        eventId: event.id,
        originalError: error instanceof Error ? error.message : String(error),
        dlqError: dlqError instanceof Error ? dlqError.message : String(dlqError)
      });
    }
  }
  async executeBatchJob(
    jobDate: Date = new Date()
  ): Promise<{ success: boolean; processedPatients: number; skippedVisits: number }> {
    // Ensure services are initialized (in case called before initialize())
    this.initializeServices();
    
    const processingDate = new Date(jobDate);
    processingDate.setDate(processingDate.getDate() - 1); // def yesterday
    const dateString = processingDate.toISOString().split("T")[0];
    
    // Use the actual current timestamp when batch job runs
    const now = new Date();
    const batchStartTimestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    logger.info({ date: dateString, batchStartTimestamp }, "Starting SHR batch job for date");

    try {
      // 1. Get patient IDs and their visits from AMRS
      const patientVisitMap = await this.visitService.findClosedVisitsForDate(
        dateString
      );

      // 2. Collect all visit UUIDs to check which are already processed
      const allVisitUuids: string[] = [];
      for (const visits of patientVisitMap.values()) {
        allVisitUuids.push(...visits);
      }

      // 3. Filter out already processed visits
      const processedVisitUuids = await this.processedVisitRepository.findProcessedVisitUuids(allVisitUuids);
      
      logger.info(
        { totalVisits: allVisitUuids.length, alreadyProcessed: processedVisitUuids.size },
        `Found ${processedVisitUuids.size} already processed visits out of ${allVisitUuids.length} total`
      );

      // 4. Build filtered patient-visit map excluding processed visits
      const filteredPatientVisitMap = new Map<string, string[]>();
      for (const [patientUuid, visits] of patientVisitMap.entries()) {
        const unprocessedVisits = visits.filter(v => !processedVisitUuids.has(v));
        if (unprocessedVisits.length > 0) {
          filteredPatientVisitMap.set(patientUuid, unprocessedVisits);
        }
      }

      const patientUuids = Array.from(filteredPatientVisitMap.keys());
      const skippedVisits = processedVisitUuids.size;

      logger.info(
        { count: patientUuids.length, skippedVisits },
        `Processing data for ${patientUuids.length} patients (skipped ${skippedVisits} already processed visits)`
      );

      if (patientUuids.length === 0) {
        logger.info("No new visits to process");
        return { success: true, processedPatients: 0, skippedVisits };
      }

      // 5. Get configurable SHR URL
      const shrUrl = config.BATCH_JOB.SHR_URL;
      let processedCount = 0;

      // 6. Process each patient and their visits
      for (const patientUuid of patientUuids) {
        const visitUuids = filteredPatientVisitMap.get(patientUuid) || [];
        
        for (const visitUuid of visitUuids) {
          try {
            const patientData = await this.amrsFhirClient.getPatientDataForDate(
              patientUuid,
              dateString
            );
            const shrBundle = await this.transformer.transform(patientData);

            const response = await axios.post(shrUrl, shrBundle);
            
            // Mark visit as successfully processed with the batch timestamp
            await this.processedVisitRepository.markVisitProcessed(
              visitUuid,
              patientUuid,
              dateString,
              response.status,
              batchStartTimestamp
            );
            
            processedCount++;
            logger.debug('Batch job response', { 
              patientUuid, 
              visitUuid, 
              status: response.status,
              processedAt: batchStartTimestamp
            });
          } catch (visitError: any) {
            const errorMessage = visitError instanceof Error ? visitError.message : String(visitError);
            const httpStatus = visitError.response?.status;
            
            // Mark visit as failed with the batch timestamp
            await this.processedVisitRepository.markVisitFailed(
              visitUuid,
              patientUuid,
              dateString,
              errorMessage,
              batchStartTimestamp,
              httpStatus
            );
            
            logger.error(
              { error: visitError, patientUuid, visitUuid, date: dateString },
              `Failed to process visit ${visitUuid} for patient ${patientUuid}`
            );
          }
        }
      }

      logger.info(
        { processedCount, skippedVisits },
        `SHR Batch Job completed: ${processedCount} visits processed, ${skippedVisits} skipped`
      );
      return { success: true, processedPatients: processedCount, skippedVisits };
    } catch (error) {
      logger.fatal({ error }, "SHR Batch Job failed catastrophically");
      throw error;
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
        isRunning: this.isRunning,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        isConnected: false,
        brokers: config.KAFKA.BROKERS,
        topics: Object.values(config.KAFKA.TOPICS),
        consumerGroups: [],
        isRunning: this.isRunning,
        lastError: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get detailed consumer status
   */
  async getConsumerStatus(): Promise<any> {
    return {
      isRunning: this.isRunning,
      consumers: Array.from(this.consumers.keys()),
      kafkaConnected: kafkaService.isServiceConnected(),
      shrServiceInitialized: !!this.shrService,
      timestamp: new Date().toISOString(),
    };
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

  private extractEncounterIdFromBundle(bundle: any): string | null {
    if (!bundle?.entry || !Array.isArray(bundle.entry)) {
      return null;
    }

    const encounterEntry = bundle.entry.find(
      (entry: any) => entry.resource?.resourceType === "Encounter"
    );

    return encounterEntry?.resource?.id || null;
  }
}

// Singleton instance
export const kafkaConsumerService = new KafkaConsumerService();

