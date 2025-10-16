// Kafka Event Types
export interface BaseKafkaEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  data: any;
  metadata?: Record<string, any>;
}

// Error Events
export interface ErrorEvent extends BaseKafkaEvent {
  type: 'error.system' | 'error.validation' | 'error.integration' | 'error.hie';
  data: {
    errorCode: string;
    errorMessage: string;
    stackTrace?: string;
    context: any;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  metadata?: {
    correlationId?: string;
    userId?: string;
    facilityId?: string;
    serviceName?: string;
    requestId?: string;
  };
}

// Union type for all event types
export type KafkaEventType = ErrorEvent;

// Kafka Health Check
export interface KafkaHealthStatus {
  isConnected: boolean;
  brokers: string[];
  topics: string[];
  consumerGroups: string[];
  isRunning?: boolean;
  lastError?: string;
  timestamp: string;
}
