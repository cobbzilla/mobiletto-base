import { MobilettoConnection, MobilettoOptions } from "./types.js";
import { MobilettoEncryptionSettings } from "./crypt.js";
export declare function mobiletto(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
