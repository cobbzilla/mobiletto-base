import { MobilettoConnection, MobilettoOptions } from "./types";
import { MobilettoEncryptionSettings } from "./crypt";
import { mobiletto } from "./mobiletto";

export async function connect(
    driverPath: string,
    key: string,
    secret?: string | null,
    opts?: MobilettoOptions | null,
    encryption?: MobilettoEncryptionSettings
): Promise<MobilettoConnection> {
    return await mobiletto(driverPath, key, secret, opts, encryption);
}

export { MobilettoError, MobilettoNotFoundError } from "mobiletto-common";

export { mobiletto, MobilettoOptions, MobilettoEncryptionSettings, MobilettoConnection };
