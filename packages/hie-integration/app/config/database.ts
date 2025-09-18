import { DataSource, DataSourceOptions } from "typeorm";
import { logger } from "../utils/logger";
import { getConfig } from "../utils/config-loader";

export interface DatabaseConfig {
  name: string;
  type: "mysql";
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  entities: any[];
  migrations: string[];
  extra?: Record<string, any>;
}

interface AppConfig {
  databases: {
    [key: string]: Omit<DatabaseConfig, "name">;
  };
  server: {
    port: number;
    host: string;
  };
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private dataSources: Map<string, DataSource> = new Map();
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

   private loadConfig(): AppConfig {
    return getConfig<AppConfig>();
  }

  public getServerConfig() {
    return this.config.server;
  }

  public async initializeAll(): Promise<void> {
    for (const [name, dbConfig] of Object.entries(this.config.databases)) {
      await this.initializeConnection(name, {
        name,
        ...dbConfig,
      });
    }
  }

  public async initializeConnection(
    name: string,
    config: DatabaseConfig
  ): Promise<DataSource> {
    if (this.dataSources.has(name)) {
      return this.dataSources.get(name)!;
    }

    try {
      const dataSource = new DataSource(config as DataSourceOptions);
      await dataSource.initialize();

      logger.info(`Database connection '${name}' established successfully`);
      this.dataSources.set(name, dataSource);

      return dataSource;
    } catch (error) {
      logger.error(`Database connection '${name}' failed:`, error);
      throw error;
    }
  }

  public getDataSource(name: string): DataSource {
    const dataSource = this.dataSources.get(name);
    if (!dataSource) {
      throw new Error(`Database connection '${name}' not initialized`);
    }
    return dataSource;
  }

  public async closeConnection(name: string): Promise<void> {
    const dataSource = this.dataSources.get(name);
    if (dataSource) {
      await dataSource.destroy();
      this.dataSources.delete(name);
      logger.info(`Database connection '${name}' closed`);
    }
  }

  public async closeAll(): Promise<void> {
    for (const [name, dataSource] of this.dataSources) {
      await dataSource.destroy();
      this.dataSources.delete(name);
      logger.info(`Database connection '${name}' closed`);
    }
  }
}