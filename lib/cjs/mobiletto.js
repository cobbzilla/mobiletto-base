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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connect = exports.mobiletto = void 0;
/* eslint-disable @typescript-eslint/ban-ts-comment */
const path_1 = require("path");
const shasum_1 = __importDefault(require("shasum"));
const randomstring = __importStar(require("randomstring"));
const stream_1 = require("stream");
const bullmq_1 = require("bullmq");
const mobiletto_common_1 = require("mobiletto-common");
const crypt_js_1 = require("./crypt.js");
const register_js_1 = require("./register.js");
const util_js_1 = require("./util.js");
const functions_js_1 = require("./functions.js");
const redis_1 = require("./redis");
const DIR_ENT_DIR_SUFFIX = "__.dirent";
const DIR_ENT_FILE_PREFIX = "dirent__";
const ENC_PAD_SEP = " ~ ";
function mobiletto(driverPath, key, secret, opts, encryption) {
    return __awaiter(this, void 0, void 0, function* () {
        mobiletto_common_1.logger.info(`mobiletto: connecting with driver ${driverPath}`);
        let driver;
        if (register_js_1.ALL_DRIVERS[driverPath]) {
            driver = register_js_1.ALL_DRIVERS[driverPath];
        }
        else {
            driver = require(driverPath.includes("/") ? driverPath : `./drivers/${driverPath}/index.js`);
        }
        let client;
        try {
            client = driver.storageClient(key, secret, opts);
        }
        catch (e) {
            const message = `mobiletto(${driverPath}) error initializing driver: ${e}`;
            mobiletto_common_1.logger.error(message);
            throw new mobiletto_common_1.MobilettoError(message);
        }
        let configValue = null;
        try {
            configValue = yield client.testConfig();
        }
        catch (e) {
            const message = `mobiletto(${driverPath}) error testing connection: ${e}`;
            mobiletto_common_1.logger.error(message);
            throw new mobiletto_common_1.MobilettoError(message);
        }
        if (!configValue) {
            const message = `mobiletto(${driverPath}) error: test API call failed`;
            mobiletto_common_1.logger.error(message);
            throw new mobiletto_common_1.MobilettoError(message);
        }
        const readOnly = opts ? !!opts.readOnly : false;
        client.redisConfig = opts && opts.redisConfig ? opts.redisConfig : {};
        if (!client.redisConfig.prefix) {
            client.redisConfig.prefix = redis_1.REDIS_PREFIX;
        }
        const internalIdForDriver = () => driverPath + "_" + (0, shasum_1.default)(`${key}\n${JSON.stringify(opts)}\n${encryption ? JSON.stringify(encryption) : ""}`);
        // If the driver didn't give the client a name, generate a unique internal name
        if (!client.id) {
            client.id = internalIdForDriver();
        }
        if (!encryption) {
            mobiletto_common_1.logger.info(`mobiletto: successfully connected using driver ${driverPath}, returning client (encryption not enabled)`);
            return (0, functions_js_1.addUtilityFunctions)((0, functions_js_1.addCacheFunctions)(client), readOnly);
        }
        // Encryption is enabled
        // Wrap the client, override various methods to enable transparent encryption
        const encKey = (0, crypt_js_1.normalizeKey)(encryption.key);
        if (!encKey) {
            const message = `mobiletto(${driverPath}) invalid encryption key`;
            mobiletto_common_1.logger.error(message);
            throw new mobiletto_common_1.MobilettoError(message);
        }
        const iv = (0, crypt_js_1.normalizeIV)(encryption.iv, encKey);
        if (!iv) {
            const message = `mobiletto(${driverPath}) invalid encryption IV`;
            mobiletto_common_1.logger.error(message);
            throw new mobiletto_common_1.MobilettoError(message);
        }
        const dirLevels = encryption.dirLevels || crypt_js_1.DEFAULT_DIR_LEVELS;
        const algo = encryption.algo || crypt_js_1.DEFAULT_CRYPT_ALGO;
        const metaWorkers = encryption.metaWorkers || crypt_js_1.DEFAULT_META_WORKERS;
        const enc = {
            key: encKey,
            iv,
            algo,
            dirLevels,
            encPathPadding: () => ENC_PAD_SEP + randomstring.generate(1 + Math.floor(2 * Math.random())),
            metaWorkers,
        };
        function encryptPath(path) {
            const encrypted = (0, shasum_1.default)(enc.key + " " + path);
            let newPath = "";
            for (let i = 0; i <= dirLevels; i++) {
                if (newPath.length > 0)
                    newPath += "/";
                newPath += encrypted.substring(i * 2, i * 2 + 2);
            }
            return newPath + encrypted;
        }
        const metaPath = (path) => encryptPath(path + " ~ META");
        const direntDir = (dir) => encryptPath(dir + DIR_ENT_DIR_SUFFIX);
        const direntFile = (dirent, path) => dirent + "/" + (0, shasum_1.default)(DIR_ENT_FILE_PREFIX + " " + path);
        const outerClient = (0, functions_js_1.addCacheFunctions)(client);
        const _metadata = (client) => (path) => __awaiter(this, void 0, void 0, function* () {
            const cache = outerClient.scopedCache("metadata");
            const cached = cache ? yield cache.get(path) : null;
            if (cached) {
                return cached;
            }
            let metaObj;
            try {
                const chunks = [];
                yield client.read(metaPath(path), (0, util_js_1.reader)(chunks));
                metaObj = JSON.parse((0, crypt_js_1.decrypt)(Buffer.concat(chunks).toString(), enc));
            }
            catch (e) {
                metaObj = {};
            }
            let meta;
            try {
                meta = yield client.metadata(encryptPath(path));
            }
            catch (e) {
                if (e instanceof mobiletto_common_1.MobilettoNotFoundError) {
                    const dd = direntDir(path);
                    try {
                        meta = yield client.metadata(dd);
                    }
                    catch (err) {
                        if (err instanceof mobiletto_common_1.MobilettoNotFoundError) {
                            const contents = yield client.list(dd);
                            if (Array.isArray(contents) && contents.length > 0) {
                                return { name: path, type: mobiletto_common_1.M_DIR };
                            }
                            else {
                                throw err;
                            }
                        }
                        else {
                            throw err;
                        }
                    }
                }
                else {
                    throw e;
                }
            }
            meta.type || (meta.type = mobiletto_common_1.M_FILE);
            meta.name = path; // rewrite name back to plaintext name
            const finalMeta = Object.assign({}, meta, metaObj);
            if (cache) {
                cache.set(path, finalMeta).then(() => {
                    mobiletto_common_1.logger.debug(`_metadata(${path}) cached meta = ${JSON.stringify(finalMeta)}`);
                }, (err) => {
                    mobiletto_common_1.logger.error(`_metadata(${path}) error: ${err}`);
                });
            }
            return finalMeta;
        });
        const _singleMeta = (job) => __awaiter(this, void 0, void 0, function* () {
            const dirent = job.data.dirent;
            const entry = job.data.entry;
            const logPrefix = `_singleMeta(${dirent}/${(0, path_1.basename)(entry.name)})`;
            return new Promise((resolve, reject) => {
                const cipherText = [];
                client
                    .read(dirent + "/" + (0, path_1.basename)(entry.name), (0, util_js_1.reader)(cipherText))
                    .then((bytesRead) => {
                    if (!bytesRead) {
                        mobiletto_common_1.logger.warn(`${logPrefix} returned no data`);
                        resolve("null");
                    }
                    else {
                        const plain = (0, crypt_js_1.decrypt)(cipherText.toString(), enc);
                        const realPath = plain.split(ENC_PAD_SEP)[0];
                        _metadata(client)(realPath)
                            .then((meta) => resolve(JSON.stringify(meta)))
                            .catch((err) => {
                            const message = `${logPrefix} error fetching _metadata: ${err}`;
                            mobiletto_common_1.logger.warn(message);
                            reject(message);
                        });
                    }
                })
                    .catch((err) => {
                    const message = `${logPrefix} error reading file: ${err}`;
                    mobiletto_common_1.logger.warn(message);
                    reject(message);
                });
            });
        });
        const META_LOAD_QUEUE_NAME = `/tmp/_/loadMetaQueue_${client.id}_`;
        const META_LOAD_JOB_NAME = `/tmp/_/loadMetaJob_${client.id}_`;
        let META_LOAD_QUEUE = null;
        const META_WORKERS = [];
        const META_HANDLERS = {};
        const META_ERR_HANDLERS = {};
        const metaLoadQueue = () => {
            if (META_LOAD_QUEUE === null) {
                if (!client.redisConfig) {
                    const message = "metaLoadQueue: redis is required but not enabled";
                    mobiletto_common_1.logger.error(message);
                    throw new mobiletto_common_1.MobilettoError(message);
                }
                const port = client.redisConfig.port || parseInt(`${redis_1.REDIS_PORT}`);
                const queueOptions = {
                    connection: {
                        host: client.redisConfig.host || redis_1.REDIS_HOST,
                        port,
                    },
                    prefix: client.redisConfig.prefix + "_" + META_LOAD_QUEUE_NAME,
                };
                META_LOAD_QUEUE = new bullmq_1.Queue(META_LOAD_QUEUE_NAME, queueOptions);
                const numWorkers = enc.metaWorkers || crypt_js_1.DEFAULT_META_WORKERS;
                for (let i = 0; i < numWorkers; i++) {
                    META_WORKERS.push(new bullmq_1.Worker(META_LOAD_QUEUE_NAME, _singleMeta, queueOptions));
                }
                const queueEvents = new bullmq_1.QueueEvents(META_LOAD_QUEUE_NAME, queueOptions);
                queueEvents.on("completed", ({ jobId, returnvalue }) => {
                    mobiletto_common_1.logger.info(`${META_LOAD_JOB_NAME} completed job ${jobId} with result: ${returnvalue}`);
                    if (META_HANDLERS[jobId]) {
                        META_HANDLERS[jobId](JSON.parse(returnvalue));
                    }
                });
                queueEvents.on("failed", ({ jobId, failedReason }) => {
                    mobiletto_common_1.logger.info(`${META_LOAD_JOB_NAME} failed job ${jobId} with result: ${failedReason}`);
                    if (META_ERR_HANDLERS[jobId]) {
                        META_ERR_HANDLERS[jobId](failedReason);
                    }
                });
            }
            return META_LOAD_QUEUE;
        };
        const _loadMeta = (dirent, entries) => __awaiter(this, void 0, void 0, function* () {
            const files = [];
            const waitForFiles = (resolve) => {
                if (files.length === entries.length) {
                    resolve(files);
                }
                else {
                    setTimeout(() => waitForFiles(resolve), 1000);
                }
            };
            const mobilettoJobID = randomstring.generate(10);
            const mq = metaLoadQueue();
            META_HANDLERS[mobilettoJobID] = (meta) => files.push(meta);
            META_ERR_HANDLERS[mobilettoJobID] = (failedReason) => {
                mobiletto_common_1.logger.error(`_loadMeta(${dirent}): error: ${failedReason}`);
            };
            for (const entry of entries) {
                const job = { mobilettoJobID, dirent, entry };
                yield mq.add(META_LOAD_JOB_NAME, job);
            }
            yield new Promise((resolve) => waitForFiles(resolve));
            delete META_HANDLERS[mobilettoJobID];
            delete META_ERR_HANDLERS[mobilettoJobID];
            return files;
        });
        function removeDirentFile(path) {
            return __awaiter(this, void 0, void 0, function* () {
                const df = direntFile(direntDir((0, path_1.dirname)(path)), path);
                const recursive = false;
                const quiet = true;
                mobiletto_common_1.logger.debug(`removeDirentFile(${path}) removing df=${df}`);
                yield client.remove(df, recursive, quiet);
                mobiletto_common_1.logger.debug(`removeDirentFile(${path}) removing encryptPath(path)=${encryptPath(path)}`);
                yield client.remove(encryptPath(path), recursive, quiet);
                mobiletto_common_1.logger.debug(`removeDirentFile(${path}) removing metaPath(path)=${metaPath(path)}`);
                yield client.remove(metaPath(path), recursive, quiet);
            });
        }
        // noinspection JSUnusedGlobalSymbols
        const encClient = {
            id: internalIdForDriver(),
            redisConfig: client.redisConfig,
            testConfig: client.testConfig,
            list: (pth = "", optsOrRecursive, visitor) => __awaiter(this, void 0, void 0, function* () {
                const p = pth === "" ? "." : pth.endsWith("/") ? pth.substring(0, pth.length - 1) : pth;
                const dirent = direntDir(p);
                let entries;
                const recursive = optsOrRecursive === true || (optsOrRecursive && optsOrRecursive.recursive) || false;
                const cacheKey = `${p} ~ ${recursive}`;
                const cache = visitor ? null : client.scopedCache("enc_list");
                const cached = cache && (yield cache.get(cacheKey));
                function cacheAndReturn(thing) {
                    if (cache) {
                        cache.set(cacheKey, thing).then(() => {
                            mobiletto_common_1.logger.debug(`enc_list: cached ${p} r=${recursive}`);
                        }, (err) => {
                            mobiletto_common_1.logger.error(`enc_list(${p}) error: ${err}`);
                        });
                    }
                    return thing;
                }
                function tryParentDirForSingleFile(p, visitor, e) {
                    return __awaiter(this, void 0, void 0, function* () {
                        // it might be a single file, try listing the parent dir
                        const parentDirent = direntDir((0, path_1.dirname)(p));
                        entries = yield client.list(parentDirent);
                        const objects = yield _loadMeta(parentDirent, entries);
                        const found = objects.find((o) => o.name === p);
                        if (found) {
                            if (visitor) {
                                yield visitor(found);
                            }
                            mobiletto_common_1.logger.debug(`tryParentDirForSingleFile(${p}) found ${found.name}`);
                            return cacheAndReturn([found]);
                        }
                        mobiletto_common_1.logger.debug(`tryParentDirForSingleFile(${p}) nothing found! e=${e}`);
                        throw e ? new mobiletto_common_1.MobilettoNotFoundError(p) : e;
                    });
                }
                if (cached) {
                    entries = cached;
                }
                else {
                    try {
                        entries = yield _loadMeta(dirent, yield client.list(dirent));
                    }
                    catch (e) {
                        if (e instanceof mobiletto_common_1.MobilettoNotFoundError) {
                            if (p.includes("/")) {
                                return yield tryParentDirForSingleFile(p, visitor, e);
                            }
                            throw e;
                        }
                        else {
                            throw new mobiletto_common_1.MobilettoError(`encClient.list(${p}) ${e}`, e instanceof Error ? e : new Error(`${e}`));
                        }
                    }
                    if (recursive) {
                        const dirs = entries.filter((obj) => obj.type === mobiletto_common_1.M_DIR);
                        while (dirs.length > 0) {
                            const dir = dirs.shift();
                            if (!dir)
                                continue;
                            const subdir = direntDir(dir.name);
                            const subdirListing = yield client.list(subdir);
                            if (subdirListing && subdirListing.length > 0) {
                                const subdirEntries = yield _loadMeta(subdir, subdirListing);
                                if (visitor) {
                                    for (const obj of subdirEntries) {
                                        yield visitor(obj);
                                    }
                                }
                                entries.push(...subdirEntries);
                                const moreDirs = subdirEntries.filter((obj) => obj.type === mobiletto_common_1.M_DIR);
                                dirs.unshift(...moreDirs);
                            }
                        }
                        if (cache) {
                            cache.set(cacheKey, entries).then(() => {
                                mobiletto_common_1.logger.debug(`enc_list: cached ${p} r=${recursive}`);
                            }, (err) => {
                                mobiletto_common_1.logger.error(`enc_list(${p}) error: ${err}`);
                            });
                        }
                        if (!entries || entries.length === 0) {
                            return [];
                        }
                    }
                }
                if (entries.length === 0 && p.includes("/")) {
                    return yield tryParentDirForSingleFile(p, visitor, null);
                }
                if (cache) {
                    cache.set(cacheKey, entries).then(() => {
                        mobiletto_common_1.logger.debug(`enc_list: cached ${p} r=${recursive}`);
                    }, (err) => {
                        mobiletto_common_1.logger.error(`enc_list(${p}) error: ${err}`);
                    });
                }
                if (!entries || entries.length === 0) {
                    return [];
                }
                if (visitor) {
                    for (const obj of entries) {
                        yield visitor(obj);
                    }
                }
                return entries;
            }),
            metadata: _metadata(client),
            read: (path, callback, endCallback) => __awaiter(this, void 0, void 0, function* () {
                const realPath = encryptPath(path);
                const cipher = (0, crypt_js_1.getDecipher)(enc);
                return yield client.read(realPath, (chunk) => {
                    return callback(cipher.update(chunk));
                }, () => {
                    callback(cipher.final());
                    if (endCallback)
                        endCallback();
                });
            }),
            write: (path, readFunc) => __awaiter(this, void 0, void 0, function* () {
                // if encrypting paths, write dirent file(s) for all parent directories
                let p = path;
                /* eslint-disable no-constant-condition */
                while (true) {
                    /* eslint-enable no-constant-condition */
                    const direntGenerator = (0, util_js_1.stringGenerator)(p + enc.encPathPadding(), enc);
                    const dir = direntDir((0, path_1.dirname)(p));
                    const df = direntFile(dir, p);
                    if (!(yield client.write(df, direntGenerator()))) {
                        throw new mobiletto_common_1.MobilettoError("write: error writing dirent file");
                    }
                    p = (0, path_1.dirname)(p);
                    if (p === "." || p === "") {
                        break;
                    }
                }
                const cipher = (0, crypt_js_1.getCipher)(enc);
                const realPath = encryptPath(path);
                const generatorBytes = { count: 0 };
                const createEncryptStream = (input) => input.pipe(new stream_1.Transform({
                    transform(chunk, encoding, callback) {
                        generatorBytes.count += chunk.length;
                        this.push(cipher.update(chunk));
                        callback();
                    },
                    flush(callback) {
                        this.push(cipher.final());
                        callback();
                    },
                }));
                // If we were passed a Readable, call write with a transform method
                if ((0, mobiletto_common_1.isReadable)(readFunc)) {
                    // @ts-ignore
                    yield client.write(realPath, createEncryptStream(readFunc));
                }
                else {
                    // If we were passed a generator, wrap it with another generator that encrypts
                    yield client.write(realPath, (0, util_js_1.newCryptGenerator)(readFunc, generatorBytes, cipher));
                }
                // write metadata
                const meta = { name: path, size: generatorBytes.count, type: mobiletto_common_1.M_FILE };
                yield client.write(metaPath(path), (0, util_js_1.stringGenerator)(JSON.stringify(meta), enc)());
                return generatorBytes.count;
            }),
            remove: (path, options, quiet) => __awaiter(this, void 0, void 0, function* () {
                mobiletto_common_1.logger.debug(`enc.remove(${path}) starting`);
                const recursive = options === true || (options && options.recursive) || false;
                quiet || (quiet = (options && typeof options !== "boolean" && options.quiet) || false);
                if (recursive) {
                    // ugh. we have to iterate over all dirent files, and remove each file/subdir one by one
                    const removed = [];
                    // @ts-ignore
                    const recRm = (path) => __awaiter(this, void 0, void 0, function* () {
                        const dirent = direntDir(path);
                        let entries;
                        try {
                            entries = yield client.list(dirent);
                        }
                        catch (e) {
                            if (quiet) {
                                mobiletto_common_1.logger.warn(`list(${path}): error listing files for recursive deletion: ${e}`);
                            }
                            else {
                                if (!(e instanceof mobiletto_common_1.MobilettoNotFoundError)) {
                                    throw e instanceof mobiletto_common_1.MobilettoError
                                        ? e
                                        : new mobiletto_common_1.MobilettoError(`list(${path}): error listing files for recursive deletion`, e instanceof Error ? e : new Error(`${e}`));
                                }
                            }
                        }
                        if (entries && entries.length > 0) {
                            const files = yield _loadMeta(dirent, entries);
                            for (const f of files) {
                                yield recRm(f.name);
                            }
                        }
                        yield removeDirentFile(path);
                        removed.push(path);
                    });
                    yield recRm(path);
                    return removed;
                }
                // remove the single file/dir
                yield removeDirentFile(path);
                // if we were the last dirent file, then also remove dirent directory, and recursively upwards
                let parent = path;
                let dirent = direntDir(parent);
                const df = direntFile(dirent, path);
                yield client.remove(df, false, true);
                /* eslint-disable no-constant-condition */
                while (true) {
                    /* eslint-enable no-constant-condition */
                    try {
                        const entries = yield client.list(dirent);
                        if (entries.length === 0) {
                            yield removeDirentFile(parent);
                        }
                    }
                    catch (e) {
                        if (!(e instanceof mobiletto_common_1.MobilettoNotFoundError)) {
                            throw e;
                        }
                    }
                    if (parent === "." || parent === "/") {
                        // do not remove dirent for root dir
                        break;
                    }
                    parent = (0, path_1.dirname)(parent);
                    dirent = direntDir(parent);
                }
                return path;
            }),
        };
        mobiletto_common_1.logger.info(`mobiletto: successfully connected using driver ${driverPath}, returning client (encryption enabled)`);
        return (0, functions_js_1.addUtilityFunctions)((0, functions_js_1.addCacheFunctions)(encClient), readOnly);
    });
}
exports.mobiletto = mobiletto;
function connect(driverPath, key, secret, opts, encryption) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield mobiletto(driverPath, key, secret, opts, encryption);
    });
}
exports.connect = connect;
