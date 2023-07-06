/// <reference types="node" />
import * as crypto from "crypto";
export declare const MIN_KEY_LEN = 16;
export declare const DEFAULT_CRYPT_ALGO = "aes-256-cbc";
export declare const DEFAULT_DIR_LEVELS = 4;
export declare const DEFAULT_META_WORKERS = 4;
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
export declare const normalizeKey: (k: string) => Buffer | null;
export declare const normalizeIV: (iv?: string, key?: Buffer | string | null) => Buffer | null;
export declare const setDefaultKey: (key: string) => void;
export declare const setDefaultIV: (iv: string) => void;
export declare const getCipher: (enc: MobilettoEncryptionConfig) => crypto.Cipher;
export declare const encrypt: (plainText: string, encryption: MobilettoEncryptionConfig, outputEncoding?: BufferEncoding) => string;
export declare const getDecipher: (enc: MobilettoEncryptionConfig) => crypto.Decipher;
export declare const decrypt: (cipherText: string, encryption: MobilettoEncryptionConfig, outputEncoding?: BufferEncoding, inputEncoding?: BufferEncoding) => string;
