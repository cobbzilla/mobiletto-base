/* eslint-disable @typescript-eslint/ban-ts-comment */
import { basename, dirname } from "path";
import shasum from "shasum";
import * as randomstring from "randomstring";
import { Transform } from "stream";
import { Job, Queue, QueueEvents, Worker } from "bullmq";

import { M_FILE, M_DIR, isReadable, logger, MobilettoError, MobilettoNotFoundError } from "mobiletto-common";

import {
    MobilettoConnection,
    MobilettoMinimalClient,
    MobilettoListOptions,
    MobilettoMetadata,
    MobilettoOptions,
    MobilettoReadable,
    MobilettoRemoveOptions,
    MobilettoVisitor,
    MobilettoWriteSource,
    MobilettoClient,
    MobilettoByteCounter,
} from "./types.js";

import {
    DEFAULT_CRYPT_ALGO,
    normalizeKey,
    normalizeIV,
    decrypt,
    getCipher,
    getDecipher,
    MobilettoEncryptionConfig,
    MobilettoEncryptionSettings,
    DEFAULT_DIR_LEVELS,
    DEFAULT_META_WORKERS,
} from "./crypt.js";
import { ALL_DRIVERS } from "./register.js";
import { newCryptGenerator, reader, stringGenerator } from "./util.js";
import { addCacheFunctions, addUtilityFunctions } from "./functions.js";
import { REDIS_HOST, REDIS_PORT, REDIS_PREFIX } from "./redis";

const DIR_ENT_DIR_SUFFIX = "__.dirent";
const DIR_ENT_FILE_PREFIX = "dirent__";
const ENC_PAD_SEP = " ~ ";

export async function mobiletto(
    driverPath: string,
    key: string,
    secret?: string | null,
    opts?: MobilettoOptions | null,
    encryption?: MobilettoEncryptionSettings
): Promise<MobilettoConnection> {
    logger.info(`mobiletto: connecting with driver ${driverPath}`);
    let driver;
    if (ALL_DRIVERS[driverPath]) {
        driver = ALL_DRIVERS[driverPath];
    } else {
        driver = require(driverPath.includes("/") ? driverPath : `./drivers/${driverPath}/index.js`);
    }
    let client: MobilettoClient;
    try {
        client = driver.storageClient(key, secret, opts);
    } catch (e) {
        const message = `mobiletto(${driverPath}) error initializing driver: ${e}`;
        logger.error(message);
        throw new MobilettoError(message);
    }
    let configValue = null;
    try {
        configValue = await client.testConfig();
    } catch (e) {
        const message = `mobiletto(${driverPath}) error testing connection: ${e}`;
        logger.error(message);
        throw new MobilettoError(message);
    }
    if (!configValue) {
        const message = `mobiletto(${driverPath}) error: test API call failed`;
        logger.error(message);
        throw new MobilettoError(message);
    }
    const readOnly = opts ? !!opts.readOnly : false;
    client.redisConfig = opts && opts.redisConfig ? opts.redisConfig : {};
    if (!client.redisConfig.prefix) {
        client.redisConfig.prefix = REDIS_PREFIX;
    }

    const internalIdForDriver = () =>
        driverPath + "_" + shasum(`${key}\n${JSON.stringify(opts)}\n${encryption ? JSON.stringify(encryption) : ""}`);

    // If the driver didn't give the client a name, generate a unique internal name
    if (!client.id) {
        client.id = internalIdForDriver();
    }
    if (!encryption) {
        logger.info(
            `mobiletto: successfully connected using driver ${driverPath}, returning client (encryption not enabled)`
        );
        return addUtilityFunctions(addCacheFunctions(client), readOnly);
    }

    // Encryption is enabled
    // Wrap the client, override various methods to enable transparent encryption
    const encKey = normalizeKey(encryption.key);
    if (!encKey) {
        const message = `mobiletto(${driverPath}) invalid encryption key`;
        logger.error(message);
        throw new MobilettoError(message);
    }
    const iv = normalizeIV(encryption.iv, encKey);
    if (!iv) {
        const message = `mobiletto(${driverPath}) invalid encryption IV`;
        logger.error(message);
        throw new MobilettoError(message);
    }
    const dirLevels: number = encryption.dirLevels || DEFAULT_DIR_LEVELS;
    const algo: string = encryption.algo || DEFAULT_CRYPT_ALGO;
    const metaWorkers: number = encryption.metaWorkers || DEFAULT_META_WORKERS;
    const enc: MobilettoEncryptionConfig = {
        key: encKey,
        iv,
        algo,
        dirLevels,
        encPathPadding: () => ENC_PAD_SEP + randomstring.generate(1 + Math.floor(2 * Math.random())),
        metaWorkers,
    };
    function encryptPath(path: string) {
        const encrypted = shasum(enc.key + " " + path);
        let newPath = "";
        for (let i = 0; i <= dirLevels; i++) {
            if (newPath.length > 0) newPath += "/";
            newPath += encrypted.substring(i * 2, i * 2 + 2);
        }
        return newPath + encrypted;
    }
    const metaPath = (path: string) => encryptPath(path + " ~ META");
    const direntDir = (dir: string) => encryptPath(dir + DIR_ENT_DIR_SUFFIX);
    const direntFile = (dirent: string, path: string) => dirent + "/" + shasum(DIR_ENT_FILE_PREFIX + " " + path);

    const outerClient = addCacheFunctions(client);
    const _metadata = (client: MobilettoMinimalClient) => async (path: string) => {
        const cache = outerClient.scopedCache("metadata");
        const cached = cache ? await cache.get(path) : null;
        if (cached) {
            return cached;
        }
        let metaObj;
        try {
            const chunks: Buffer[] = [];
            await client.read(metaPath(path), reader(chunks));
            metaObj = JSON.parse(decrypt(Buffer.concat(chunks).toString(), enc));
        } catch (e) {
            metaObj = {};
        }
        let meta;
        try {
            meta = await client.metadata(encryptPath(path));
        } catch (e) {
            if (e instanceof MobilettoNotFoundError) {
                const dd = direntDir(path);
                try {
                    meta = await client.metadata(dd);
                } catch (err) {
                    if (err instanceof MobilettoNotFoundError) {
                        const contents = await client.list(dd);
                        if (Array.isArray(contents) && contents.length > 0) {
                            return { name: path, type: M_DIR };
                        } else {
                            throw err;
                        }
                    } else {
                        throw err;
                    }
                }
            } else {
                throw e;
            }
        }
        meta.type ||= M_FILE;
        meta.name = path; // rewrite name back to plaintext name
        const finalMeta = Object.assign({}, meta, metaObj);
        if (cache) {
            cache.set(path, finalMeta).then(
                () => {
                    logger.debug(`_metadata(${path}) cached meta = ${JSON.stringify(finalMeta)}`);
                },
                (err: Error) => {
                    logger.error(`_metadata(${path}) error: ${err}`);
                }
            );
        }
        return finalMeta;
    };

    const _singleMeta = async (job: Job): Promise<string> => {
        const dirent = job.data.dirent;
        const entry = job.data.entry;
        const logPrefix = `_singleMeta(${dirent}/${basename(entry.name)})`;
        return new Promise((resolve, reject) => {
            const cipherText: Buffer[] = [];
            client
                .read(dirent + "/" + basename(entry.name), reader(cipherText))
                .then((bytesRead) => {
                    if (!bytesRead) {
                        logger.warn(`${logPrefix} returned no data`);
                        resolve("null");
                    } else {
                        const plain = decrypt(cipherText.toString(), enc);
                        const realPath = plain.split(ENC_PAD_SEP)[0];
                        _metadata(client)(realPath)
                            .then((meta) => resolve(JSON.stringify(meta)))
                            .catch((err) => {
                                const message = `${logPrefix} error fetching _metadata: ${err}`;
                                logger.warn(message);
                                reject(message);
                            });
                    }
                })
                .catch((err) => {
                    const message = `${logPrefix} error reading file: ${err}`;
                    logger.warn(message);
                    reject(message);
                });
        });
    };

    const META_LOAD_QUEUE_NAME = "/_/loadMetaQueue";
    const META_LOAD_JOB_NAME = "/_/loadMetaJob";
    let META_LOAD_QUEUE: Queue | null = null;
    const META_WORKERS: Worker[] = [];
    const META_HANDLERS: Record<string, (returnvalue: MobilettoMetadata) => unknown> = {};
    const META_ERR_HANDLERS: Record<string, (failedReason: string) => unknown> = {};
    const metaLoadQueue = () => {
        if (META_LOAD_QUEUE === null) {
            if (!client.redisConfig) {
                const message = "metaLoadQueue: redis is required but not enabled";
                logger.error(message);
                throw new MobilettoError(message);
            }
            const port: number = client.redisConfig.port || parseInt(`${REDIS_PORT}`);
            META_LOAD_QUEUE = new Queue(META_LOAD_QUEUE_NAME, {
                connection: {
                    host: client.redisConfig.host || REDIS_HOST,
                    port,
                },
                prefix: client.redisConfig.prefix + "_" + META_LOAD_QUEUE_NAME,
            });

            const numWorkers = enc.metaWorkers || DEFAULT_META_WORKERS;
            for (let i = 0; i < numWorkers; i++) {
                META_WORKERS.push(new Worker(META_LOAD_QUEUE_NAME, _singleMeta));
            }

            const queueEvents = new QueueEvents(META_LOAD_QUEUE_NAME);
            queueEvents.on("completed", ({ jobId, returnvalue }): void => {
                logger.info(`${META_LOAD_JOB_NAME} completed job ${jobId} with result: ${returnvalue}`);
                if (META_HANDLERS[jobId]) {
                    META_HANDLERS[jobId](JSON.parse(returnvalue));
                }
            });
            queueEvents.on("failed", ({ jobId, failedReason }): void => {
                logger.info(`${META_LOAD_JOB_NAME} failed job ${jobId} with result: ${failedReason}`);
                if (META_ERR_HANDLERS[jobId]) {
                    META_ERR_HANDLERS[jobId](failedReason);
                }
            });
        }
        return META_LOAD_QUEUE;
    };

    const _loadMeta = async (dirent: string, entries: MobilettoMetadata[]) => {
        const files: MobilettoMetadata[] = [];

        const waitForFiles = (resolve: (files: MobilettoMetadata[]) => unknown) => {
            if (files.length === entries.length) {
                resolve(files);
            } else {
                setTimeout(() => waitForFiles(resolve), 1000);
            }
        };

        const mobilettoJobID = randomstring.generate(10);
        const mq = metaLoadQueue();
        META_HANDLERS[mobilettoJobID] = (meta: MobilettoMetadata) => files.push(meta);
        META_ERR_HANDLERS[mobilettoJobID] = (failedReason) => {
            logger.error(`_loadMeta(${dirent}): error: ${failedReason}`);
        };
        for (const entry of entries) {
            const job = { mobilettoJobID, dirent, entry };
            await mq.add(META_LOAD_JOB_NAME, job);
        }
        await new Promise((resolve) => waitForFiles(resolve));
        delete META_HANDLERS[mobilettoJobID];
        delete META_ERR_HANDLERS[mobilettoJobID];
        return files;
    };

    async function removeDirentFile(path: string) {
        const df = direntFile(direntDir(dirname(path)), path);
        const recursive = false;
        const quiet = true;

        logger.debug(`removeDirentFile(${path}) removing df=${df}`);
        await client.remove(df, recursive, quiet);

        logger.debug(`removeDirentFile(${path}) removing encryptPath(path)=${encryptPath(path)}`);
        await client.remove(encryptPath(path), recursive, quiet);

        logger.debug(`removeDirentFile(${path}) removing metaPath(path)=${metaPath(path)}`);
        await client.remove(metaPath(path), recursive, quiet);
    }

    // noinspection JSUnusedGlobalSymbols
    const encClient: MobilettoMinimalClient = {
        id: internalIdForDriver(),
        redisConfig: client.redisConfig,
        testConfig: client.testConfig,
        list: async (
            pth = "",
            optsOrRecursive?: MobilettoListOptions | boolean,
            visitor?: MobilettoVisitor
        ): Promise<MobilettoMetadata[]> => {
            const p = pth === "" ? "." : pth.endsWith("/") ? pth.substring(0, pth.length - 1) : pth;
            const dirent = direntDir(p);
            let entries: MobilettoMetadata[];
            const recursive = optsOrRecursive === true || (optsOrRecursive && optsOrRecursive.recursive) || false;
            const cacheKey = `${p} ~ ${recursive}`;
            const cache = visitor ? null : client.scopedCache("enc_list");
            const cached: MobilettoMetadata[] | null | undefined = cache && (await cache.get(cacheKey));

            function cacheAndReturn(thing: MobilettoMetadata[]): MobilettoMetadata[] {
                if (cache) {
                    cache.set(cacheKey, thing).then(
                        () => {
                            logger.debug(`enc_list: cached ${p} r=${recursive}`);
                        },
                        (err: Error) => {
                            logger.error(`enc_list(${p}) error: ${err}`);
                        }
                    );
                }
                return thing;
            }

            async function tryParentDirForSingleFile(
                p: string,
                visitor?: MobilettoVisitor,
                e?: Error | null
            ): Promise<MobilettoMetadata[]> {
                // it might be a single file, try listing the parent dir
                const parentDirent = direntDir(dirname(p));
                entries = await client.list(parentDirent);
                const objects = await _loadMeta(parentDirent, entries);
                const found = objects.find((o) => o.name === p);
                if (found) {
                    if (visitor) {
                        await visitor(found);
                    }
                    logger.debug(`tryParentDirForSingleFile(${p}) found ${found.name}`);
                    return cacheAndReturn([found]);
                }
                logger.debug(`tryParentDirForSingleFile(${p}) nothing found! e=${e}`);
                throw e ? new MobilettoNotFoundError(p) : e;
            }

            if (cached) {
                entries = cached;
            } else {
                try {
                    entries = await _loadMeta(dirent, await client.list(dirent));
                } catch (e) {
                    if (e instanceof MobilettoNotFoundError) {
                        if (p.includes("/")) {
                            return await tryParentDirForSingleFile(p, visitor, e);
                        }
                        throw e;
                    } else {
                        throw new MobilettoError(
                            `encClient.list(${p}) ${e}`,
                            e instanceof Error ? e : new Error(`${e}`)
                        );
                    }
                }
                if (recursive) {
                    const dirs = entries.filter((obj) => obj.type === M_DIR);
                    while (dirs.length > 0) {
                        const dir: MobilettoMetadata | undefined = dirs.shift();
                        if (!dir) continue;
                        const subdir = direntDir(dir.name);
                        const subdirListing = await client.list(subdir);
                        if (subdirListing && subdirListing.length > 0) {
                            const subdirEntries = await _loadMeta(subdir, subdirListing);
                            if (visitor) {
                                for (const obj of subdirEntries) {
                                    await visitor(obj);
                                }
                            }
                            entries.push(...subdirEntries);
                            const moreDirs = subdirEntries.filter((obj) => obj.type === M_DIR);
                            dirs.unshift(...moreDirs);
                        }
                    }
                    if (cache) {
                        cache.set(cacheKey, entries).then(
                            () => {
                                logger.debug(`enc_list: cached ${p} r=${recursive}`);
                            },
                            (err: Error) => {
                                logger.error(`enc_list(${p}) error: ${err}`);
                            }
                        );
                    }
                    if (!entries || entries.length === 0) {
                        return [];
                    }
                }
            }
            if (entries.length === 0 && p.includes("/")) {
                return await tryParentDirForSingleFile(p, visitor, null);
            }
            if (cache) {
                cache.set(cacheKey, entries).then(
                    () => {
                        logger.debug(`enc_list: cached ${p} r=${recursive}`);
                    },
                    (err: Error) => {
                        logger.error(`enc_list(${p}) error: ${err}`);
                    }
                );
            }
            if (!entries || entries.length === 0) {
                return [];
            }
            if (visitor) {
                for (const obj of entries) {
                    await visitor(obj);
                }
            }
            return entries;
        },
        metadata: _metadata(client),
        read: async (path: string, callback: (chunk: Buffer) => void, endCallback?: () => void) => {
            const realPath = encryptPath(path);
            const cipher = getDecipher(enc);
            return await client.read(
                realPath,
                (chunk) => {
                    return callback(cipher.update(chunk));
                },
                () => {
                    callback(cipher.final());
                    if (endCallback) endCallback();
                }
            );
        },
        write: async (path: string, readFunc: MobilettoWriteSource) => {
            // if encrypting paths, write dirent file(s) for all parent directories
            let p = path;
            /* eslint-disable no-constant-condition */
            while (true) {
                /* eslint-enable no-constant-condition */
                const direntGenerator = stringGenerator(p + enc.encPathPadding(), enc);
                const dir = direntDir(dirname(p));
                const df = direntFile(dir, p);
                if (!(await client.write(df, direntGenerator()))) {
                    throw new MobilettoError("write: error writing dirent file");
                }
                p = dirname(p);
                if (p === "." || p === "") {
                    break;
                }
            }

            const cipher = getCipher(enc);
            const realPath = encryptPath(path);
            const generatorBytes: MobilettoByteCounter = { count: 0 };
            const createEncryptStream = (input: MobilettoReadable) =>
                input.pipe(
                    new Transform({
                        transform(chunk, encoding, callback) {
                            generatorBytes.count += chunk.length;
                            this.push(cipher.update(chunk));
                            callback();
                        },
                        flush(callback) {
                            this.push(cipher.final());
                            callback();
                        },
                    })
                );

            // If we were passed a Readable, call write with a transform method
            if (isReadable(readFunc)) {
                // @ts-ignore
                await client.write(realPath, createEncryptStream(readFunc));
            } else {
                // If we were passed a generator, wrap it with another generator that encrypts
                await client.write(realPath, newCryptGenerator(readFunc, generatorBytes, cipher));
            }
            // write metadata
            const meta = { name: path, size: generatorBytes.count, type: M_FILE };
            await client.write(metaPath(path), stringGenerator(JSON.stringify(meta), enc)());
            return generatorBytes.count;
        },

        remove: async (
            path: string,
            options?: MobilettoRemoveOptions | boolean,
            quiet?: boolean
        ): Promise<string[] | string> => {
            logger.debug(`enc.remove(${path}) starting`);
            const recursive = options === true || (options && options.recursive) || false;
            quiet ||= (options && typeof options !== "boolean" && options.quiet) || false;
            if (recursive) {
                // ugh. we have to iterate over all dirent files, and remove each file/subdir one by one
                const removed: string[] = [];
                // @ts-ignore
                const recRm = async (path: string) => {
                    const dirent = direntDir(path);
                    let entries;
                    try {
                        entries = await client.list(dirent);
                    } catch (e) {
                        if (quiet) {
                            logger.warn(`list(${path}): error listing files for recursive deletion: ${e}`);
                        } else {
                            if (!(e instanceof MobilettoNotFoundError)) {
                                throw e instanceof MobilettoError
                                    ? e
                                    : new MobilettoError(
                                          `list(${path}): error listing files for recursive deletion`,
                                          e instanceof Error ? e : new Error(`${e}`)
                                      );
                            }
                        }
                    }
                    if (entries && entries.length > 0) {
                        const files = await _loadMeta(dirent, entries);
                        for (const f of files) {
                            await recRm(f.name);
                        }
                    }
                    await removeDirentFile(path);
                    removed.push(path);
                };
                await recRm(path);
                return removed;
            }

            // remove the single file/dir
            await removeDirentFile(path);

            // if we were the last dirent file, then also remove dirent directory, and recursively upwards
            let parent = path;
            let dirent = direntDir(parent);
            const df = direntFile(dirent, path);
            await client.remove(df, false, true);
            /* eslint-disable no-constant-condition */
            while (true) {
                /* eslint-enable no-constant-condition */
                try {
                    const entries = await client.list(dirent);
                    if (entries.length === 0) {
                        await removeDirentFile(parent);
                    }
                } catch (e) {
                    if (!(e instanceof MobilettoNotFoundError)) {
                        throw e;
                    }
                }
                if (parent === "." || parent === "/") {
                    // do not remove dirent for root dir
                    break;
                }
                parent = dirname(parent);
                dirent = direntDir(parent);
            }
            return path;
        },
    };
    logger.info(`mobiletto: successfully connected using driver ${driverPath}, returning client (encryption enabled)`);
    return addUtilityFunctions(addCacheFunctions(encClient), readOnly);
}
