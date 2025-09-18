import * as fs from "fs";
import { join } from "path";
import { logger } from "./logger";

export function getConfig<T = any>(): T {
  const envConfigPath = process.env.CONFIG_PATH;
  if (envConfigPath) {
    try {
      const configContent = fs.readFileSync(envConfigPath, "utf8");
      logger.info(
        `Configuration loaded from environment variable: CONFIG_PATH`
      );
      return JSON.parse(configContent);
    } catch (error) {
      logger.warn(
        `Failed to load config from env path ${envConfigPath}:`,
        error
      );
    }
  }

  const fallbackPaths = [
    join(process.cwd(), "config", "config.json"),
    join(process.cwd(), "config.json"),
    join(__dirname, "..", "config", "config.json"),
  ];

  for (const path of fallbackPaths) {
    try {
      const configContent = fs.readFileSync(path, "utf8");
      logger.info(`Configuration loaded from fallback path: ${path}`);
      return JSON.parse(configContent);
    } catch (error) {
      continue;
    }
  }

  const searchedPaths = [
    ...(envConfigPath ? [envConfigPath] : []),
    ...fallbackPaths,
  ];

  throw new Error(
    `Configuration file not found. Searched paths: ${searchedPaths.join(", ")}`
  );
}

export function configExists(): boolean {
  const envConfigPath = process.env.CONFIG_PATH;
  if (envConfigPath) {
    try {
      fs.accessSync(envConfigPath, fs.constants.F_OK);
      return true;
    } catch {
      logger.warn(
        `Config path from environment variable CONFIG_PATH does not exist: ${envConfigPath}`
      );
    }
  }

  const fallbackPaths = [
    join(process.cwd(), "config", "config.json"),
    join(process.cwd(), "config.json"),
    join(__dirname, "..", "config", "config.json"),
  ];

  return fallbackPaths.some((path) => {
    try {
      fs.accessSync(path, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function getConfigPath(): string {
  const envConfigPath = process.env.CONFIG_PATH;
  if (envConfigPath) {
    try {
      fs.accessSync(envConfigPath, fs.constants.F_OK);
      return envConfigPath;
    } catch {
      logger.warn(
        `Config path from environment variable CONFIG_PATH does not exist: ${envConfigPath}`
      );
    }
  }

  const fallbackPaths = [
    join(process.cwd(), "config", "config.json"),
    join(process.cwd(), "config.json"),
    join(__dirname, "..", "config", "config.json"),
  ];

  for (const path of fallbackPaths) {
    try {
      fs.accessSync(path, fs.constants.F_OK);
      return path;
    } catch {
      continue;
    }
  }

  throw new Error("Configuration file not found");
}
