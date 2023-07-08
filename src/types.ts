import { CacheLike } from "./cache";
import {
    MobilettoListOptions,
    MobilettoMetadata,
    MobilettoMinimalClient,
    MobilettoMirrorResults,
    MobilettoOptions,
    MobilettoRedisConfig,
    MobilettoWriteSource,
    MobilettoVisitor,
} from "mobiletto-common";
import { Worker } from "bullmq";

export type MobilettoConnection = MobilettoMinimalClient & {
    safeList: (path?: string, opts?: MobilettoListOptions) => Promise<MobilettoMetadata[]>;
    safeMetadata: (path: string) => Promise<MobilettoMetadata | null>;
    readFile: (path: string) => Promise<Buffer>;
    safeReadFile: (path: string) => Promise<Buffer | null>;
    writeFile: (path: string, data: MobilettoWriteSource) => Promise<number>;
    mirror: (source: MobilettoConnection, clientPath: string, sourcePath: string) => Promise<MobilettoMirrorResults>;
};

export type MobilettoConnectionFunction = (
    key: string,
    secret?: string,
    opts?: MobilettoOptions
) => MobilettoMinimalClient;

export type MobilettoDriver = {
    storageClient: MobilettoConnectionFunction;
};

export type MobilettoDriverParameter = MobilettoConnectionFunction | MobilettoDriver;

export type MobilettoClient = MobilettoConnection & {
    id?: string;
    redisConfig: MobilettoRedisConfig;
    cache: CacheLike;
    redis: () => CacheLike;
    queueWorkers: Worker[];
    scopedCache: (cacheName: string, size?: number) => CacheLike;
    flush: () => Promise<void>;
    driver_list: (path?: string, recursive?: boolean, visitor?: MobilettoVisitor) => Promise<MobilettoMetadata[]>;
    driver_write: (path: string, data: MobilettoWriteSource) => Promise<number>;
    driver_metadata: (path: string) => Promise<MobilettoMetadata>;
    driver_remove: (path: string, recursive?: boolean, quiet?: boolean) => Promise<string | string[]>;
    destroy: () => void;
};
