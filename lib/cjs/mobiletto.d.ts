import { MobilettoOptions } from "mobiletto-common";
import { MobilettoConnection, MobilettoQueue } from "./types.js";
import { MobilettoEncryptionSettings } from "./crypt.js";
export declare const ALL_MQ: Record<string, MobilettoQueue>;
export declare function mobiletto(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
export declare function connect(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
