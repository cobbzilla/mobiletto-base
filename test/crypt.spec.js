import fs from "fs";
import { describe, it } from "mocha";
import { expect } from "chai";
import { rand } from "mobiletto-common";
import * as crypto from "crypto";

import {
    DEFAULT_CRYPT_ALGO,
    normalizeKey,
    normalizeIV,
    readStream,
    encrypt,
    decrypt,
    getCipher,
    getDecipher,
} from "../lib/esm/index.js";

describe("crypto test", () => {
    const enc = {
        key: normalizeKey(rand(32)),
        iv: normalizeIV(rand(16)),
        algo: DEFAULT_CRYPT_ALGO,
    };
    it("should encrypt and decrypt a data buffer successfully", async () => {
        const plaintext = rand(64 * 1024 + Math.floor(1024 * Math.random()));
        const ciphertext = encrypt(plaintext, enc);
        const decrypted = decrypt(ciphertext, enc);
        expect(decrypted).to.equal(plaintext, "decrypted data did not match plaintext");
    });
    it("should encrypt and decrypt a stream successfully", async () => {
        const plaintext = crypto.randomBytes(81920);
        const cipher = getCipher(enc);
        const updateData = cipher.update(plaintext);
        const finalData = cipher.final();
        const encrypted = Buffer.concat([updateData, finalData]);

        const decipher = getDecipher(enc);
        const decryptUpdate = decipher.update(encrypted);
        const decipherFinal = decipher.final();
        const decrypted = Buffer.concat([decryptUpdate, decipherFinal]);
        expect(decrypted.length).to.equal(plaintext.length);
        for (let i = 0; i < decrypted.length; i++) {
            expect(decrypted[i]).to.equal(plaintext[i], `decrypted data did not match plaintext at position ${i}`);
        }
    });
    it("should encrypt and decrypt a stream successfully using readStream", async () => {
        const plaintext = crypto.randomBytes(81920);
        const cipher = getCipher(enc);
        const updateData = cipher.update(plaintext);
        const finalData = cipher.final();
        const encrypted = Buffer.concat([updateData, finalData]);

        const tempFile = `/tmp/stream_foo_${Date.now}.tmp`;
        fs.writeFileSync(tempFile, encrypted);

        const rs = fs.createReadStream(tempFile);
        const decipher = getDecipher(enc);
        const buffers = [];
        await readStream(
            rs,
            (chunk) => {
                buffers.push(decipher.update(chunk));
            },
            () => {
                buffers.push(decipher.final());
            }
        );
        const decrypted = Buffer.concat(buffers);
        expect(decrypted.length).to.equal(plaintext.length);
        for (let i = 0; i < decrypted.length; i++) {
            expect(decrypted[i]).to.equal(plaintext[i], `decrypted data did not match plaintext at position ${i}`);
        }
    });
});
