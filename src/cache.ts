import { LRUCache } from "lru-cache";

export type Cacheable = string | number | boolean | NonNullable<object>;

export interface CacheLike {
    get: <T>(key: string) => Promise<T | null | undefined>;
    set: (key: string, value: Cacheable) => Promise<void>;
    flush: () => Promise<void>;
    disconnect: () => void;
}

export class AwaitableLRU implements CacheLike {
    lru;
    constructor(size = 100) {
        this.lru = new LRUCache<string, string>({ max: size });
    }
    get = async <T>(key: string): Promise<T | null | undefined> => {
        const val = this.lru.get(key);
        return val ? JSON.parse(val) : null;
    };
    set = async (key: string, value: Cacheable): Promise<void> => {
        this.lru.set(key, JSON.stringify(value));
    };
    flush = async (): Promise<void> => Promise.resolve(this.lru.clear());
    disconnect = () => {
        /* noop */
    };
}

class DisabledCache implements CacheLike {
    get = async <T>(): Promise<T | null | undefined> => undefined;
    set = async (): Promise<void> => undefined;
    flush = async (): Promise<void> => {
        /* noop */
    };
    disconnect = () => {
        /* noop */
    };
}

export const DISABLED_CACHE = new DisabledCache();
