"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.getDecipher = exports.encrypt = exports.getCipher = exports.setDefaultIV = exports.setDefaultKey = exports.normalizeIV = exports.normalizeKey = exports.DEFAULT_META_WORKERS = exports.DEFAULT_DIR_LEVELS = exports.DEFAULT_CRYPT_ALGO = exports.MIN_KEY_LEN = void 0;
const crypto = __importStar(require("crypto"));
const shasum_1 = __importDefault(require("shasum"));
const WARN_PLAINTEXT = !process.env.IGNORE_DISABLED_ENCRYPTION;
exports.MIN_KEY_LEN = 16;
exports.DEFAULT_CRYPT_ALGO = "aes-256-cbc";
exports.DEFAULT_DIR_LEVELS = 4;
exports.DEFAULT_META_WORKERS = 4;
const sha = (val) => (0, shasum_1.default)(val, "SHA-256");
const normalizeKey = (k) => typeof k === "string" && k.trim().length > exports.MIN_KEY_LEN ? Buffer.from(sha(k.trim())).subarray(0, 32) : null;
exports.normalizeKey = normalizeKey;
const normalizeIV = (iv, key) => typeof iv === "string" && iv.trim().length >= 16
    ? Buffer.from(sha(iv.trim())).subarray(0, 16)
    : key
        ? Buffer.from(sha(key)).subarray(0, 16)
        : null;
exports.normalizeIV = normalizeIV;
// ensure key long enough for security, and is 32 bytes for AES-256
let KEY = null;
const setDefaultKey = (key) => {
    KEY = (0, exports.normalizeKey)(key);
};
exports.setDefaultKey = setDefaultKey;
// ensure IV is 16 bytes for AES-256
let CRYPTO_IV = null;
const setDefaultIV = (iv) => {
    CRYPTO_IV = (0, exports.normalizeIV)(iv, KEY);
};
exports.setDefaultIV = setDefaultIV;
const getCipher = (enc) => {
    const algo = enc.algo ? enc.algo : exports.DEFAULT_CRYPT_ALGO;
    const iv = enc.iv ? enc.iv : null;
    const c = crypto.createCipheriv(algo, enc.key, iv);
    c.setAutoPadding(true);
    return c;
};
exports.getCipher = getCipher;
const encrypt = (plainText, encryption, outputEncoding = "base64") => {
    if (!encryption || !encryption.key) {
        if (WARN_PLAINTEXT) {
            console.warn(` ****** encryption.key is undefined, encryption is DISABLED`);
        }
        return plainText;
    }
    const cipher = (0, exports.getCipher)(encryption);
    const encoded = Buffer.concat([cipher.update(plainText), cipher.final()]);
    return encoded.toString(outputEncoding);
};
exports.encrypt = encrypt;
const getDecipher = (enc) => {
    const algo = enc.algo ? enc.algo : exports.DEFAULT_CRYPT_ALGO;
    const iv = enc.iv ? enc.iv : null;
    const c = crypto.createDecipheriv(algo, enc.key, iv);
    c.setAutoPadding(true);
    return c;
};
exports.getDecipher = getDecipher;
const decrypt = (cipherText, encryption, outputEncoding = "utf8", inputEncoding = "base64") => {
    if (!encryption || !encryption.key) {
        return cipherText;
    }
    const cipher = (0, exports.getDecipher)(encryption);
    const data = Buffer.from(cipherText, inputEncoding);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString(outputEncoding);
};
exports.decrypt = decrypt;
