import * as crypto from "crypto";
import shasum from "shasum";
const WARN_PLAINTEXT = !process.env.IGNORE_DISABLED_ENCRYPTION;
export const MIN_KEY_LEN = 16;
export const DEFAULT_CRYPT_ALGO = "aes-256-cbc";
export const DEFAULT_DIR_LEVELS = 4;
export const DEFAULT_META_WORKERS = 4;
const sha = (val) => shasum(val, "SHA-256");
export const normalizeKey = (k) => typeof k === "string" && k.trim().length > MIN_KEY_LEN ? Buffer.from(sha(k.trim())).subarray(0, 32) : null;
export const normalizeIV = (iv, key) => typeof iv === "string" && iv.trim().length >= 16
    ? Buffer.from(sha(iv.trim())).subarray(0, 16)
    : key
        ? Buffer.from(sha(key)).subarray(0, 16)
        : null;
// ensure key long enough for security, and is 32 bytes for AES-256
let KEY = null;
export const setDefaultKey = (key) => {
    KEY = normalizeKey(key);
};
// ensure IV is 16 bytes for AES-256
let CRYPTO_IV = null;
export const setDefaultIV = (iv) => {
    CRYPTO_IV = normalizeIV(iv, KEY);
};
export const getCipher = (enc) => {
    const algo = enc.algo ? enc.algo : DEFAULT_CRYPT_ALGO;
    const iv = enc.iv ? enc.iv : null;
    const c = crypto.createCipheriv(algo, enc.key, iv);
    c.setAutoPadding(true);
    return c;
};
export const encrypt = (plainText, encryption, outputEncoding = "base64") => {
    if (!encryption || !encryption.key) {
        if (WARN_PLAINTEXT) {
            console.warn(` ****** encryption.key is undefined, encryption is DISABLED`);
        }
        return plainText;
    }
    const cipher = getCipher(encryption);
    const encoded = Buffer.concat([cipher.update(plainText), cipher.final()]);
    return encoded.toString(outputEncoding);
};
export const getDecipher = (enc) => {
    const algo = enc.algo ? enc.algo : DEFAULT_CRYPT_ALGO;
    const iv = enc.iv ? enc.iv : null;
    const c = crypto.createDecipheriv(algo, enc.key, iv);
    c.setAutoPadding(true);
    return c;
};
export const decrypt = (cipherText, encryption, outputEncoding = "utf8", inputEncoding = "base64") => {
    if (!encryption || !encryption.key) {
        return cipherText;
    }
    const cipher = getDecipher(encryption);
    const data = Buffer.from(cipherText, inputEncoding);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString(outputEncoding);
};
