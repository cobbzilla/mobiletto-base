import { encrypt } from "./crypt.js";
export const reader = (chunks) => (chunk) => {
    if (chunk) {
        chunks.push(chunk);
    }
};
const initMobilettoTempDir = () => {
    const dir = process.env.MOBILETTO_TMP || process.env.TMPDIR || "/tmp";
    return dir.endsWith("/") ? dir.substring(0, dir.length - 1) : dir;
};
export const MOBILETTO_TMP = initMobilettoTempDir();
export const stringGenerator = (value, enc) => {
    return function* () {
        yield encrypt(value, enc);
    };
};
export const newCryptGenerator = (readFunc, generatorBytes, cipher) => {
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
//# sourceMappingURL=util.js.map