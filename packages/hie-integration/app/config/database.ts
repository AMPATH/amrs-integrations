import { DataSource, DataSourceOptions } from 'typeorm';
import { PractitionerRecord } from '../models/PractitionerRecord';
import { logger } from '../utils/logger';
import { getEnv, getEnvNumber } from '../utils/env';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private dataSource: DataSource | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<DataSource> {
    if (this.dataSource) {
      return this.dataSource;
    }

    const dbConfig: DataSourceOptions = {
      type: 'mysql',
      host: getEnv('DB_HOST', 'localhost'),
      port: getEnvNumber('DB_PORT', 3306),
      username: getEnv('DB_USERNAME', 'db_username'),
      password: getEnv('DB_PASSWORD', 'db_password'),
      database: getEnv('DB_NAME', 'database_name'),
      entities: [PractitionerRecord],
      synchronize: getEnv('NODE_ENV', 'development') === 'development',
      logging: getEnv('NODE_ENV', 'development') === 'development',
      migrations: ['dist/migrations/*.js'],
      driver: require('mysql2'),
    };

    try {
      this.dataSource = new DataSource(dbConfig);
      await this.dataSource.initialize();
      logger.info('Database connection established successfully');
      return this.dataSource;
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  public getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('Database connection not initialized');
    }
    return this.dataSource;
  }

  public async close(): Promise<void> {
    if (this.dataSource) {
      await this.dataSource.destroy();
      this.dataSource = null;
      logger.info('Database connection closed');
    }
  }
}