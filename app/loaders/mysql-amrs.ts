import config from "../config";

import mysql, { Connection, MysqlError, Pool } from "mysql";
export default class AmrsConnectionManager {
  private static instance: AmrsConnectionManager;
  private amrsPool: Pool;

  private constructor() {
    this.amrsPool = this.createPool(config);
  }
  static getInstance(): AmrsConnectionManager {
    if (!AmrsConnectionManager.instance) {
      AmrsConnectionManager.instance = new AmrsConnectionManager();
    }
    return AmrsConnectionManager.instance;
  }

  createPool(conf: any): Pool {
    return mysql.createPool({
      host: conf.prodDbURL,
      user: conf.user,
      password: conf.password,
      database: conf.prodDb,
      port: conf.prodDbPort,
      connectionLimit: conf.connectionLimit,
    });
  }
  async getConnectionAmrs(): Promise<Connection> {
    return this.getConnection(this.amrsPool);
  }
  private async getConnection(pool: Pool): Promise<Connection> {
    return new Promise<Connection>((success, error) => {
      pool.getConnection((err, conn) => {
        if (err) {
          error(err);
          return;
        }
        success(conn);
      });
    });
  }
  async query(query: string, connection: Connection): Promise<any> {
    return new Promise((resolve, reject) => {
      connection.query(query, (error, results, fields) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  }
  async releaseConnections(amrsCon: mysql.Connection) {
    amrsCon.destroy();
  }
}
