import { QueueEvents, Worker } from "bullmq";
import { MobilettoOptions } from "mobiletto-common";
import { MobilettoConnection } from "./types.js";
import { MobilettoEncryptionSettings } from "./crypt.js";
export declare const ALL_WORKERS: Worker[];
export declare const ALL_QUEUE_EVENTS: QueueEvents[];
export declare function mobiletto(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
export declare function connect(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
