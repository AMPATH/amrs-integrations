import NodeCache from 'node-cache';

const nodeCache = new NodeCache({
  stdTTL: 300, // default TTL 5 minutes
  checkperiod: 60 // check for expired items every minute
});

export const cacheUtil = {
  get: <T>(key: string): T | undefined => nodeCache.get<T>(key),
  set: (key: string, value: any, ttl?: number) => nodeCache.set(key, value, ttl || 300),
  del: (key: string) => nodeCache.del(key)
};


export const cache = cacheUtil;