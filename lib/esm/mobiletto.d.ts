import { Worker } from "bullmq";
import { MobilettoOptions } from "mobiletto-common";
import { MobilettoConnection } from "./types.js";
import { MobilettoEncryptionSettings } from "./crypt.js";
export declare const ALL_META_WORKERS: Worker[];
export declare function mobiletto(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
export declare function connect(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
