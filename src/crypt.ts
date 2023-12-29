import * as crypto from "crypto";
import { sha256 } from "zilla-util";
import { BinaryLike } from "crypto";

const WARN_PLAINTEXT = !process.env.IGNORE_DISABLED_ENCRYPTION;
export const MIN_KEY_LEN = 16;
export const DEFAULT_CRYPT_ALGO = "aes-256-cbc";
export const DEFAULT_DIR_LEVELS = 4;
export const DEFAULT_META_WORKERS = 4;

export type MobilettoEncryptionSettings = {
    key: string;
    iv?: string;
    algo?: string;
    dirLevels?: number;
    metaWorkers?: number;
};

export type MobilettoEncryptionConfig = {
    key: Buffer;
    iv: Buffer;
    algo: string;
    dirLevels: number;
    encPathPadding: () => string;
    metaWorkers: number;
};

const sha = sha256;

export const normalizeKey = (k: string): Buffer | null =>
    typeof k === "string" && k.trim().length > MIN_KEY_LEN ? Buffer.from(sha(k.trim())).subarray(0, 32) : null;

export const normalizeIV = (iv?: string, key?: Buffer | string | null): Buffer | null =>
    typeof iv === "string" && iv.trim().length >= 16
        ? Buffer.from(sha(iv.trim())).subarray(0, 16)
        : key
        ? Buffer.from(sha(key)).subarray(0, 16)
        : null;

export const getCipher = (enc: MobilettoEncryptionConfig): crypto.Cipher => {
    const algo: string = enc.algo ? enc.algo : DEFAULT_CRYPT_ALGO;
    const iv: BinaryLike | null = enc.iv ? enc.iv : null;
    const c = crypto.createCipheriv(algo, enc.key, iv);
    c.setAutoPadding(true);
    return c;
};

export const encrypt = (
    plainText: string,
    encryption: MobilettoEncryptionConfig,
    outputEncoding: BufferEncoding = "base64"
): string => {
    if (!encryption || !encryption.key) {
        if (WARN_PLAINTEXT) {
            console.warn(` ****** encryption.key is undefined, encryption is DISABLED`);
        }
        return plainText;
    }
    const cipher = getCipher(encryption);
    const encoded: Buffer = Buffer.concat([cipher.update(plainText), cipher.final()]);
    return encoded.toString(outputEncoding);
};

export const getDecipher = (enc: MobilettoEncryptionConfig): crypto.Decipher => {
    const algo: string = enc.algo ? enc.algo : DEFAULT_CRYPT_ALGO;
    const iv: BinaryLike | null = enc.iv ? enc.iv : null;
    const c = crypto.createDecipheriv(algo, enc.key, iv);
    c.setAutoPadding(true);
    return c;
};

export const decrypt = (
    cipherText: string,
    encryption: MobilettoEncryptionConfig,
    outputEncoding: BufferEncoding = "utf8",
    inputEncoding: BufferEncoding = "base64"
): string => {
    if (!encryption || !encryption.key) {
        return cipherText;
    }
    const cipher = getDecipher(encryption);
    const data = Buffer.from(cipherText, inputEncoding);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString(outputEncoding);
};
