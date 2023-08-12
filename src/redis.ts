import Redis from "ioredis";
import { logger } from "mobiletto-common";

import { DEFAULT_REDIS_OPTIONS } from "ioredis/built/redis/RedisOptions.js";
import { AwaitableLRU, Cacheable, CacheLike } from "./cache.js";

export const REDIS_HOST = process.env.MOBILETTO_REDIS_HOST || "127.0.0.1";
export const REDIS_PORT = process.env.MOBILETTO_REDIS_PORT || 6379;
export const REDIS_PREFIX = process.env.MOBILETTO_REDIS_PREFIX || "_mobiletto__";

const REDIS_CLIENTS: Record<string, MobilettoCache> = {};

export const getRedis = (name: string, host: string, port: number, prefix: string): MobilettoCache => {
    if (typeof REDIS_CLIENTS[name] === "undefined") {
        REDIS_CLIENTS[name] = new MobilettoCache(name, host, port, prefix + name + "_");
    }
    return REDIS_CLIENTS[name];
};

const DEFAULT_EXPIRATION_MILLIS = 1000 * 60 * 60 * 24; // 1 day

type CacheCounters = {
    get: number;
    set: number;
    del: number;
    flush: number;
    hit: number;
    miss: number;
};

const ZERO_COUNTERS: CacheCounters = {
    get: 0,
    set: 0,
    del: 0,
    flush: 0,
    hit: 0,
    miss: 0,
};

export class MobilettoCache implements CacheLike {
    readonly name: string;
    redis: Redis | null;
    readonly prefix: string;
    readonly scopedCaches: Record<string, CacheLike> = {};
    counters: CacheCounters = Object.assign({}, ZERO_COUNTERS);
    printStatsInterval = 1000;
    constructor(name: string, host = "127.0.0.1", port = 6379, prefix = "_mobiletto__") {
        this.name = name;
        if (host && port) {
            try {
                this.redis = new Redis(Object.assign({}, DEFAULT_REDIS_OPTIONS, { host, port }));
            } catch (e) {
                if (logger.isErrorEnabled())
                    logger.error(
                        `redis(${name}) error connecting to redis, using fallback LRU for scoped caches: ${e}`
                    );
                this.redis = null;
            }
        } else {
            if (logger.isWarningEnabled())
                logger.warn(`redis(${name}) no host or port provided, using fallback LRU for scoped caches`);
            this.redis = null;
        }
        this.prefix = prefix;
        if (this.redis) {
            // test connection by flushing
            this.flush()
                .then(() => {
                    if (logger.isDebugEnabled()) logger.debug(`redis(${name}) successfully flushed`);
                })
                .catch((e) => {
                    if (logger.isWarningEnabled()) logger.warn(`redis(${name}) error flushing: ${e}, disabling redis`);
                    this.redis = null;
                });
        }
    }

    disconnect = () => {
        try {
            if (this.redis) {
                this.redis.disconnect();
                this.redis = null;
            }
        } catch (e) {
            if (logger.isWarningEnabled()) logger.warn(`disconnect: error disconnecting from redis(${this.name}) ${e}`);
        }
    };

    stats = () => this.counters;
    resetStats = () => {
        this.counters = Object.assign({}, ZERO_COUNTERS);
    };
    hitRate = () => (this.counters.get === 0 ? 0 : (100 * this.counters.hit) / this.counters.get);
    toString = () =>
        `MobilettoCache(${this.name}) [${this.counters.hit}/${
            this.counters.get
        } = ${this.hitRate()}% hit] stats=${JSON.stringify(this.counters)}`;

    pfx = (key: string) => (key.startsWith(this.prefix) ? key : this.prefix + key);
    unprefix = (key: string) => (key && key.startsWith(this.prefix) ? key.substring(this.prefix.length) : key);

    doRedisAsync = async <T>(func: (redis: Redis) => Promise<T>, defaultValue: T | null = null): Promise<T | null> => {
        try {
            return this.redis ? await func(this.redis) : defaultValue;
        } catch (e) {
            if (logger.isWarningEnabled())
                logger.warn(
                    `redis(${this.name}) doRedisAsync(${func}) ${e} (returning default value: ${defaultValue})`
                );
            return defaultValue;
        }
    };

    doRedis = <T>(func: (redis: Redis) => T, defaultValue: T | null = null): T | null => {
        try {
            return this.redis ? func(this.redis) : defaultValue;
        } catch (e) {
            if (logger.isWarningEnabled())
                logger.warn(`redis(${this.name}) doRedis(${func}) ${e} (returning default value: ${defaultValue})`);
            return defaultValue;
        }
    };

    get = async <T>(key: string): Promise<T | null | undefined> => {
        this.counters.get++;
        if (logger.isTraceEnabled()) logger.trace(`redis(${this.name}) get(${key}) starting`);
        const val = await this.doRedis((r) => r.get(this.pfx(key)), null);
        if (logger.isTraceEnabled()) logger.trace(`redis(${this.name}) get(${key}) found value: ${val}`);
        if (val) {
            this.counters.hit++;
        } else {
            this.counters.miss++;
        }
        if (
            this.printStatsInterval &&
            this.printStatsInterval > 0 &&
            this.counters.get % this.printStatsInterval === 0
        ) {
            const message = `${new Date()}: ${this}`;
            if (logger.isInfoEnabled()) logger.info(message);
        }
        return val ? JSON.parse(val) : null;
    };

    set = async (key: string, val: Cacheable, expirationMillis: number = DEFAULT_EXPIRATION_MILLIS): Promise<void> => {
        this.counters.set++;
        if (logger.isTraceEnabled())
            logger.trace(`redis(${this.name}) set(${key}, ${val}, ${expirationMillis}) starting`);
        await this.doRedisAsync((r) => r.set(this.pfx(key), JSON.stringify(val), "EX", expirationMillis / 1000));
        if (logger.isTraceEnabled())
            logger.trace(`redis(${this.name}) set(${key}, ${val}, ${expirationMillis}) finished`);
    };

    del = async (key: string): Promise<void> => {
        this.counters.del++;
        await this.doRedisAsync((r) => r.del(this.pfx(key)));
    };

    scan = async <T>(
        pattern: string,
        callback?: (key: string) => Promise<T>,
        endCallback?: (count: number) => Promise<unknown>
    ): Promise<T[]> => {
        const redis = this.redis;
        if (!redis) return [];
        const matches: T[] = [];
        return await new Promise((resolve, reject) => {
            try {
                const stream = redis.scanStream({
                    match: this.pfx(pattern),
                    count: 100,
                });
                stream.on("data", async (resultKeys) => {
                    if (resultKeys) {
                        for (const k of resultKeys) {
                            const val: T = callback ? await callback(k) : k;
                            matches.push(val);
                        }
                    }
                });
                stream.on("end", async () => {
                    if (endCallback) {
                        await endCallback(matches.length);
                    }
                    resolve(matches);
                });
                stream.on("error", (err) => {
                    reject(err);
                });
            } catch (e) {
                reject(e);
            }
        });
    };

    findMatchingKeys = async (pattern: string): Promise<string[]> => {
        return await this.scan(pattern);
    };

    applyToMatchingKeys = async <T>(pattern: string, asyncFunc: (key: string) => Promise<T>): Promise<T[]> => {
        return await this.scan(pattern, asyncFunc);
    };

    removeMatchingKeys = async (pattern: string): Promise<void[]> => await this.applyToMatchingKeys(pattern, this.del);

    flush = async () => {
        this.counters.flush++;
        await this.removeMatchingKeys("*");
    };

    scopedCache = (name: string, size = 100): CacheLike => {
        if (this.scopedCaches[name]) {
            return this.scopedCaches[name];
        }
        if (!this.redis) {
            return new AwaitableLRU(size && size > 0 ? size : 100);
        }
        const realKey = (k: string): string => `:scoped:${name}_${k ? k : ""}`;
        const cache: CacheLike = {
            get: async <T>(key: string): Promise<T | null | undefined> => this.get(realKey(key)),
            set: async (key: string, value: Cacheable) => {
                if (key && value) {
                    try {
                        const rk = realKey(key);
                        if (rk) await this.set(rk, value);
                    } catch (e) {
                        if (logger.isWarningEnabled()) logger.warn(`redis(${this.name}) set(${key}) error: ${e}`);
                    }
                }
            },
            flush: async (): Promise<void> => {
                await this.removeMatchingKeys(realKey(""));
            },
            disconnect: () => {
                delete this.scopedCaches[name];
            },
        };
        this.scopedCaches[name] = cache;
        return cache;
    };
}

const forAllCaches = async <T>(func: (client: MobilettoCache) => Promise<T>): Promise<T[]> => {
    const promises = [];
    for (const name of Object.keys(REDIS_CLIENTS)) {
        promises.push(func(REDIS_CLIENTS[name]));
    }
    return Promise.all(promises);
};

export const teardown = async () =>
    await forAllCaches(async (client: MobilettoCache): Promise<undefined> => {
        client.disconnect();
    });

export const flushAll = async () => await forAllCaches(async (client) => client.flush());
