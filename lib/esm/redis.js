var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import Redis from "ioredis";
import { logger } from "mobiletto-common";
import { DEFAULT_REDIS_OPTIONS } from "ioredis/built/redis/RedisOptions.js";
import { AwaitableLRU } from "./cache.js";
export const REDIS_HOST = process.env.MOBILETTO_REDIS_HOST || "127.0.0.1";
export const REDIS_PORT = process.env.MOBILETTO_REDIS_PORT || 6379;
export const REDIS_PREFIX = process.env.MOBILETTO_REDIS_PREFIX || "_mobiletto__";
const REDIS_CLIENTS = {};
export const getRedis = (name, host, port, prefix) => {
    if (typeof REDIS_CLIENTS[name] === "undefined") {
        REDIS_CLIENTS[name] = new MobilettoCache(name, host, port, prefix + name + "_");
    }
    return REDIS_CLIENTS[name];
};
const DEFAULT_EXPIRATION_MILLIS = 1000 * 60 * 60 * 24; // 1 day
const ZERO_COUNTERS = {
    get: 0,
    set: 0,
    del: 0,
    flush: 0,
    hit: 0,
    miss: 0,
};
export class MobilettoCache {
    constructor(name, host = "127.0.0.1", port = 6379, prefix = "_mobiletto__") {
        this.scopedCaches = {};
        this.counters = Object.assign({}, ZERO_COUNTERS);
        this.printStatsInterval = 1000;
        this.disconnect = () => {
            try {
                if (this.redis) {
                    this.redis.disconnect();
                    this.redis = null;
                }
            }
            catch (e) {
                logger.warn(`disconnect: error disconnecting from redis(${this.name}) ${e}`);
            }
        };
        this.stats = () => this.counters;
        this.resetStats = () => {
            this.counters = Object.assign({}, ZERO_COUNTERS);
        };
        this.hitRate = () => (this.counters.get === 0 ? 0 : (100 * this.counters.hit) / this.counters.get);
        this.toString = () => `MobilettoCache(${this.name}) [${this.counters.hit}/${this.counters.get} = ${this.hitRate()}% hit] stats=${JSON.stringify(this.counters)}`;
        this.pfx = (key) => (key.startsWith(this.prefix) ? key : this.prefix + key);
        this.unprefix = (key) => (key && key.startsWith(this.prefix) ? key.substring(this.prefix.length) : key);
        this.doRedisAsync = (func, defaultValue = null) => __awaiter(this, void 0, void 0, function* () {
            try {
                return this.redis ? yield func(this.redis) : defaultValue;
            }
            catch (e) {
                logger.warn(`redis(${this.name}) doRedisAsync(${func}) ${e} (returning default value: ${defaultValue})`);
                return defaultValue;
            }
        });
        this.doRedis = (func, defaultValue = null) => {
            try {
                return this.redis ? func(this.redis) : defaultValue;
            }
            catch (e) {
                logger.warn(`redis(${this.name}) doRedis(${func}) ${e} (returning default value: ${defaultValue})`);
                return defaultValue;
            }
        };
        this.get = (key) => __awaiter(this, void 0, void 0, function* () {
            this.counters.get++;
            logger.trace(`redis(${this.name}) get(${key}) starting`);
            const val = yield this.doRedis((r) => r.get(this.pfx(key)), null);
            logger.trace(`redis(${this.name}) get(${key}) found value: ${val}`);
            if (val) {
                this.counters.hit++;
            }
            else {
                this.counters.miss++;
            }
            if (this.printStatsInterval &&
                this.printStatsInterval > 0 &&
                this.counters.get % this.printStatsInterval === 0) {
                const message = `${new Date()}: ${this}`;
                logger.info(message);
            }
            return val ? JSON.parse(val) : null;
        });
        this.set = (key, val, expirationMillis = DEFAULT_EXPIRATION_MILLIS) => __awaiter(this, void 0, void 0, function* () {
            this.counters.set++;
            logger.trace(`redis(${this.name}) set(${key}, ${val}, ${expirationMillis}) starting`);
            yield this.doRedisAsync((r) => r.set(this.pfx(key), JSON.stringify(val), "EX", expirationMillis / 1000));
            logger.trace(`redis(${this.name}) set(${key}, ${val}, ${expirationMillis}) finished`);
        });
        this.del = (key) => __awaiter(this, void 0, void 0, function* () {
            this.counters.del++;
            yield this.doRedisAsync((r) => r.del(this.pfx(key)));
        });
        this.scan = (pattern, callback, endCallback) => __awaiter(this, void 0, void 0, function* () {
            const redis = this.redis;
            if (!redis)
                return [];
            const matches = [];
            return yield new Promise((resolve, reject) => {
                try {
                    const stream = redis.scanStream({
                        match: this.pfx(pattern),
                        count: 100,
                    });
                    stream.on("data", (resultKeys) => __awaiter(this, void 0, void 0, function* () {
                        if (resultKeys) {
                            for (const k of resultKeys) {
                                const val = callback ? yield callback(k) : k;
                                matches.push(val);
                            }
                        }
                    }));
                    stream.on("end", () => __awaiter(this, void 0, void 0, function* () {
                        if (endCallback) {
                            yield endCallback(matches.length);
                        }
                        resolve(matches);
                    }));
                    stream.on("error", (err) => {
                        reject(err);
                    });
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        this.findMatchingKeys = (pattern) => __awaiter(this, void 0, void 0, function* () {
            return yield this.scan(pattern);
        });
        this.applyToMatchingKeys = (pattern, asyncFunc) => __awaiter(this, void 0, void 0, function* () {
            return yield this.scan(pattern, asyncFunc);
        });
        this.removeMatchingKeys = (pattern) => __awaiter(this, void 0, void 0, function* () { return yield this.applyToMatchingKeys(pattern, this.del); });
        this.flush = () => __awaiter(this, void 0, void 0, function* () {
            this.counters.flush++;
            yield this.removeMatchingKeys("*");
        });
        this.scopedCache = (name, size = 100) => {
            if (this.scopedCaches[name]) {
                return this.scopedCaches[name];
            }
            if (!this.redis) {
                return new AwaitableLRU(size && size > 0 ? size : 100);
            }
            const realKey = (k) => `:scoped:${name}_${k ? k : ""}`;
            const cache = {
                get: (key) => __awaiter(this, void 0, void 0, function* () { return this.get(realKey(key)); }),
                set: (key, value) => __awaiter(this, void 0, void 0, function* () {
                    if (key && value) {
                        try {
                            const rk = realKey(key);
                            if (rk)
                                yield this.set(rk, value);
                        }
                        catch (e) {
                            logger.warn(`redis(${this.name}) set(${key}) error: ${e}`);
                        }
                    }
                }),
                flush: () => __awaiter(this, void 0, void 0, function* () {
                    yield this.removeMatchingKeys(realKey(""));
                }),
                disconnect: () => {
                    delete this.scopedCaches[name];
                },
            };
            this.scopedCaches[name] = cache;
            return cache;
        };
        this.name = name;
        if (host && port) {
            try {
                this.redis = new Redis(Object.assign({}, DEFAULT_REDIS_OPTIONS, { host, port }));
            }
            catch (e) {
                logger.error(`redis(${name}) error connecting to redis, using fallback LRU for scoped caches: ${e}`);
                this.redis = null;
            }
        }
        else {
            logger.warn(`redis(${name}) no host or port provided, using fallback LRU for scoped caches`);
            this.redis = null;
        }
        this.prefix = prefix;
        if (this.redis) {
            // test connection by flushing
            this.flush()
                .then(() => {
                logger.debug(`redis(${name}) successfully flushed`);
            })
                .catch((e) => {
                logger.warn(`redis(${name}) error flushing: ${e}, disabling redis`);
                this.redis = null;
            });
        }
    }
}
const forAllCaches = (func) => __awaiter(void 0, void 0, void 0, function* () {
    const promises = [];
    for (const name of Object.keys(REDIS_CLIENTS)) {
        promises.push(func(REDIS_CLIENTS[name]));
    }
    return Promise.all(promises);
});
export const teardown = () => __awaiter(void 0, void 0, void 0, function* () {
    return yield forAllCaches((client) => __awaiter(void 0, void 0, void 0, function* () {
        client.disconnect();
    }));
});
export const flushAll = () => __awaiter(void 0, void 0, void 0, function* () { return yield forAllCaches((client) => __awaiter(void 0, void 0, void 0, function* () { return client.flush(); })); });
