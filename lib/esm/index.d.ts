import { MobilettoConnection, MobilettoOptions } from "./types.js";
import { MobilettoEncryptionSettings } from "./crypt.js";
import { mobiletto } from "./mobiletto.js";
export declare function connect(driverPath: string, key: string, secret?: string | null, opts?: MobilettoOptions | null, encryption?: MobilettoEncryptionSettings): Promise<MobilettoConnection>;
export { MobilettoError, MobilettoNotFoundError } from "mobiletto-common";
export { MobilettoVisitor, MobilettoMetadata, MobilettoDriver, MobilettoListOptions, MobilettoRemoveOptions, MobilettoMirrorResults, MobilettoMinimalClient, MobilettoRedisConfig, MobilettoWriteSource, } from "./types.js";
export { encrypt, decrypt } from "./crypt.js";
export { mobiletto, MobilettoOptions, MobilettoEncryptionSettings, MobilettoConnection };
