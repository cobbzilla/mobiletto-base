/// <reference types="node" />
import crypto from "crypto";
import { MobilettoByteCounter, MobilettoWriteSource } from "./types.js";
import { MobilettoEncryptionConfig } from "./crypt.js";
export declare const reader: (chunks: Buffer[]) => (chunk: Buffer) => void;
export declare const MOBILETTO_TMP: string;
export declare const stringGenerator: (value: string, enc: MobilettoEncryptionConfig) => () => Generator<string, void, unknown>;
export declare const newCryptGenerator: (readFunc: MobilettoWriteSource, generatorBytes: MobilettoByteCounter, cipher: crypto.Cipher) => Generator<Buffer, void, unknown>;
