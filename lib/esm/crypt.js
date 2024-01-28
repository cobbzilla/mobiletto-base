import * as crypto from "crypto";
import { sha256 } from "zilla-util";
const WARN_PLAINTEXT = !process.env.IGNORE_DISABLED_ENCRYPTION;
export const MIN_KEY_LEN = 16;
export const DEFAULT_CRYPT_ALGO = "aes-256-cbc";
export const DEFAULT_DIR_LEVELS = 4;
export const DEFAULT_META_WORKERS = 4;
const sha = sha256;
export const normalizeKey = (k) => typeof k === "string" && k.trim().length > MIN_KEY_LEN ? Buffer.from(sha(k.trim())).subarray(0, 32) : null;
export const normalizeIV = (iv, key) => typeof iv === "string" && iv.trim().length >= 16
    ? Buffer.from(sha(iv.trim())).subarray(0, 16)
    : key
        ? Buffer.from(sha(key)).subarray(0, 16)
        : null;
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
//# sourceMappingURL=crypt.js.map