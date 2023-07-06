/// <reference types="node" />
import crypto from "crypto";
import { MobilettoByteCounter, MobilettoWriteSource } from "./types";
import { MobilettoEncryptionConfig } from "./crypt";
export declare const REDIS_HOST: string;
export declare const REDIS_PORT: string | number;
export declare const REDIS_PREFIX: string;
export declare const reader: (chunks: Buffer[]) => (chunk: Buffer) => void;
export declare const MOBILETTO_TMP: string;
export declare const stringGenerator: (value: string, enc: MobilettoEncryptionConfig) => () => Generator<string, void, unknown>;
export declare const newCryptGenerator: (readFunc: MobilettoWriteSource, generatorBytes: MobilettoByteCounter, cipher: crypto.Cipher) => Generator<Buffer, void, unknown>;
