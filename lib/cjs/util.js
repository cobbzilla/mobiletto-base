"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newCryptGenerator = exports.stringGenerator = exports.MOBILETTO_TMP = exports.reader = exports.REDIS_PREFIX = exports.REDIS_PORT = exports.REDIS_HOST = void 0;
const crypt_1 = require("./crypt");
exports.REDIS_HOST = process.env.MOBILETTO_REDIS_HOST || "127.0.0.1";
exports.REDIS_PORT = process.env.MOBILETTO_REDIS_PORT || 6379;
exports.REDIS_PREFIX = process.env.MOBILETTO_REDIS_PREFIX || "_mobiletto__";
const reader = (chunks) => (chunk) => {
    if (chunk) {
        chunks.push(chunk);
    }
};
exports.reader = reader;
const initMobilettoTempDir = () => {
    const dir = process.env.MOBILETTO_TMP || process.env.TMPDIR || "/tmp";
    return dir.endsWith("/") ? dir.substring(0, dir.length - 1) : dir;
};
exports.MOBILETTO_TMP = initMobilettoTempDir();
const stringGenerator = (value, enc) => {
    return function* () {
        yield (0, crypt_1.encrypt)(value, enc);
    };
};
exports.stringGenerator = stringGenerator;
const newCryptGenerator = (readFunc, generatorBytes, cipher) => {
    return (function* cryptGenerator(plaintextGenerator) {
        let chunk = plaintextGenerator.next().value;
        while (chunk) {
            generatorBytes.count += chunk.length;
            yield cipher.update(chunk);
            chunk = plaintextGenerator.next().value;
        }
        yield cipher.final();
    })(readFunc);
};
exports.newCryptGenerator = newCryptGenerator;
