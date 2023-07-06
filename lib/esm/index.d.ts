import { MobilettoConnection, MobilettoOptions } from "./types";
import { MobilettoEncryptionSettings } from "./crypt";
import { mobiletto } from "./mobiletto";
export declare function connect(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
export { MobilettoError, MobilettoNotFoundError } from "mobiletto-common";
export { mobiletto, MobilettoOptions, MobilettoEncryptionSettings, MobilettoConnection };
