import crypto from "crypto";
import { MobilettoByteCounter, MobilettoReadFunc, MobilettoWriteSource } from "./types";
import { encrypt, MobilettoEncryptionConfig } from "./crypt";

export const REDIS_HOST = process.env.MOBILETTO_REDIS_HOST || "127.0.0.1";
export const REDIS_PORT = process.env.MOBILETTO_REDIS_PORT || 6379;
export const REDIS_PREFIX = process.env.MOBILETTO_REDIS_PREFIX || "_mobiletto__";

export const reader =
    (chunks: Buffer[]) =>
    (chunk: Buffer): void => {
        if (chunk) {
            chunks.push(chunk);
        }
    };

const initMobilettoTempDir = () => {
    const dir = process.env.MOBILETTO_TMP || process.env.TMPDIR || "/tmp";
    return dir.endsWith("/") ? dir.substring(0, dir.length - 1) : dir;
};
export const MOBILETTO_TMP = initMobilettoTempDir();

export const stringGenerator = (value: string, enc: MobilettoEncryptionConfig) => {
    return function* () {
        yield encrypt(value, enc);
    };
};

export const newCryptGenerator = (
    readFunc: MobilettoWriteSource,
    generatorBytes: MobilettoByteCounter,
    cipher: crypto.Cipher
) => {
    return (function* cryptGenerator(plaintextGenerator: MobilettoReadFunc) {
        let chunk = plaintextGenerator.next().value;
        while (chunk) {
            generatorBytes.count += chunk.length;
            yield cipher.update(chunk);
            chunk = plaintextGenerator.next().value;
        }
        yield cipher.final();
    })(readFunc as MobilettoReadFunc);
};
