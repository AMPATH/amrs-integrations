import { DataSource, DataSourceOptions } from "typeorm";
import { readFileSync } from "fs";
import { join } from "path";
import { PractitionerRecord } from "../models/PractitionerRecord";
import { logger } from "../utils/logger";

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
    const configPath = this.findConfigPath();
    const configContent = readFileSync(configPath, "utf8");
    return JSON.parse(configContent);
  }

  private findConfigPath(): string {
    const possiblePaths = [
      join(process.cwd(), "config", "config.json"),
      join(process.cwd(), "config.json"),
      join(__dirname, "..", "config", "config.json"),
    ];

    for (const path of possiblePaths) {
      try {
        readFileSync(path, "utf8");
        return path;
      } catch (error) {
        continue;
      }
    }

    throw new Error("Configuration file not found");
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

// import { DataSource, DataSourceOptions } from 'typeorm';
// import { PractitionerRecord } from '../models/PractitionerRecord';
// import { logger } from '../utils/logger';
// import { getEnv, getEnvNumber } from '../utils/env';

// export class DatabaseManager {
//   private static instance: DatabaseManager;
//   private dataSource: DataSource | null = null;

//   private constructor() {}

//   public static getInstance(): DatabaseManager {
//     if (!DatabaseManager.instance) {
//       DatabaseManager.instance = new DatabaseManager();
//     }
//     return DatabaseManager.instance;
//   }

//   public async initialize(): Promise<DataSource> {
//     if (this.dataSource) {
//       return this.dataSource;
//     }

//     const dbConfig: DataSourceOptions = {
//       type: 'mysql',
//       host: getEnv('DB_HOST', 'localhost'),
//       port: getEnvNumber('DB_PORT', 3306),
//       username: getEnv('DB_USERNAME', 'db_username'),
//       password: getEnv('DB_PASSWORD', 'db_password'),
//       database: getEnv('DB_NAME', 'database_name'),
//       entities: [PractitionerRecord],
//       synchronize: getEnv('NODE_ENV', 'development') === 'development',
//       logging: getEnv('NODE_ENV', 'development') === 'development',
//       migrations: ['dist/migrations/*.js'],
//       driver: require('mysql2'),
//     };

//     try {
//       this.dataSource = new DataSource(dbConfig);
//       await this.dataSource.initialize();
//       logger.info('Database connection established successfully');
//       return this.dataSource;
//     } catch (error) {
//       logger.error('Database connection failed:', error);
//       throw error;
//     }
//   }

//   public getDataSource(): DataSource {
//     if (!this.dataSource) {
//       throw new Error('Database connection not initialized');
//     }
//     return this.dataSource;
//   }

//   public async close(): Promise<void> {
//     if (this.dataSource) {
//       await this.dataSource.destroy();
//       this.dataSource = null;
//       logger.info('Database connection closed');
//     }
//   }
// }
