import { LRUCache } from "lru-cache";
export type Cacheable = string | number | boolean | NonNullable<object>;
export interface CacheLike {
    get: <T>(key: string) => Promise<T | null | undefined>;
    set: (key: string, value: Cacheable) => Promise<void>;
    flush: () => Promise<void>;
    disconnect: () => void;
}
export declare class AwaitableLRU implements CacheLike {
    lru: LRUCache<string, string, unknown>;
    constructor(size?: number);
    get: <T>(key: string) => Promise<T | null | undefined>;
    set: (key: string, value: Cacheable) => Promise<void>;
    flush: () => Promise<void>;
    disconnect: () => void;
}
declare class DisabledCache implements CacheLike {
    get: <T>() => Promise<T | null | undefined>;
    set: () => Promise<void>;
    flush: () => Promise<void>;
    disconnect: () => void;
}
export declare const DISABLED_CACHE: DisabledCache;
export {};
