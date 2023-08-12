/* eslint-disable @typescript-eslint/ban-ts-comment */
import { basename, dirname } from "path";
import shasum from "shasum";
import { Transform } from "stream";
import { Job, Queue, QueueEvents, Worker } from "bullmq";

import {
    M_FILE,
    M_DIR,
    isReadable,
    logger,
    MobilettoError,
    MobilettoNotFoundError,
    rand,
    MobilettoFeatureFlags,
} from "mobiletto-common";

import {
    MobilettoMinimalClient,
    MobilettoListOptions,
    MobilettoMetadata,
    MobilettoOptions,
    MobilettoReadable,
    MobilettoRemoveOptions,
    MobilettoVisitor,
    MobilettoWriteSource,
    MobilettoByteCounter,
} from "mobiletto-common";

import { MobilettoConnection, MobilettoClient, MobilettoQueue, MobilettoDriverParameter } from "./types.js";

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
import { REDIS_HOST, REDIS_PORT, REDIS_PREFIX } from "./redis.js";

const DIR_ENT_DIR_SUFFIX = "__.dirent";
const DIR_ENT_FILE_PREFIX = "dirent__";
const ENC_PAD_SEP = " ~ ";

export const ALL_MQ: Record<string, MobilettoQueue> = {};

export async function mobiletto(
    driverPath: string | MobilettoDriverParameter,
    key: string,
    secret?: string | null,
    opts?: MobilettoOptions | null,
    encryption?: MobilettoEncryptionSettings
): Promise<MobilettoConnection> {
    if (logger.isInfoEnabled()) logger.info(`mobiletto: connecting with driver ${driverPath}`);
    let driver;
    if (typeof driverPath === "string") {
        if (ALL_DRIVERS[driverPath]) {
            driver = ALL_DRIVERS[driverPath];
        } else if (require) {
            driver = require(driverPath.includes("/") ? driverPath : `./drivers/${driverPath}/index.js`);
        } else {
            throw new MobilettoError(
                `mobiletto: error resolving driver (require not supported): ${driverPath} (try an ES import of the driver package)`
            );
        }
    } else if (typeof driverPath === "function") {
        driver = { storageClient: driverPath };
    } else if (typeof driverPath === "object" && typeof driverPath.storageClient === "function") {
        driver = driverPath;
    } else {
        throw new MobilettoError(
            `mobiletto: expected registered driver name or a MobilettoDriverParameter, received a ${typeof driverPath} with value ${driverPath}`
        );
    }
    let client: MobilettoClient;
    try {
        client = driver.storageClient(key, secret || undefined, opts || undefined);
    } catch (e) {
        const message = `mobiletto(${driverPath}) error initializing driver: ${e}`;
        if (logger.isErrorEnabled()) logger.error(message);
        throw new MobilettoError(message);
    }
    let configValue = null;
    try {
        configValue = await client.testConfig();
    } catch (e) {
        const message = `mobiletto(${driverPath}) error testing connection: ${e}`;
        if (logger.isErrorEnabled()) logger.error(message);
        throw new MobilettoError(message);
    }
    if (!configValue) {
        const message = `mobiletto(${driverPath}) error: test API call failed`;
        if (logger.isErrorEnabled()) logger.error(message);
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
    client.queueWorkers = [];
    if (!encryption) {
        if (logger.isInfoEnabled())
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
        if (logger.isErrorEnabled()) logger.error(message);
        throw new MobilettoError(message);
    }
    const iv = normalizeIV(encryption.iv, encKey);
    if (!iv) {
        const message = `mobiletto(${driverPath}) invalid encryption IV`;
        if (logger.isErrorEnabled()) logger.error(message);
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
        encPathPadding: () => ENC_PAD_SEP + rand(1 + Math.floor(2 * Math.random())),
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
                    if (logger.isDebugEnabled())
                        logger.debug(`_metadata(${path}) cached meta = ${JSON.stringify(finalMeta)}`);
                },
                (err: Error) => {
                    if (logger.isErrorEnabled()) logger.error(`_metadata(${path}) error: ${err}`);
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
                        if (logger.isWarningEnabled()) logger.warn(`${logPrefix} returned no data`);
                        resolve("null");
                    } else {
                        const plain = decrypt(cipherText.toString(), enc);
                        const realPath = plain.split(ENC_PAD_SEP)[0];
                        _metadata(client)(realPath)
                            .then((meta) => {
                                if (
                                    job.data.mobilettoJobID &&
                                    typeof META_HANDLERS[job.data.mobilettoJobID] === "function"
                                ) {
                                    META_HANDLERS[job.data.mobilettoJobID](meta);
                                }
                                resolve(JSON.stringify(meta));
                            })
                            .catch((err) => {
                                const message = `${logPrefix} error fetching _metadata: ${err}`;
                                if (logger.isWarningEnabled()) logger.warn(message);
                                if (
                                    job.data.mobilettoJobID &&
                                    typeof META_ERR_HANDLERS[job.data.mobilettoJobID] === "function"
                                ) {
                                    META_ERR_HANDLERS[job.data.mobilettoJobID](message);
                                }
                                reject(message);
                            });
                    }
                })
                .catch((err) => {
                    const message = `${logPrefix} error reading file: ${err}`;
                    if (logger.isWarningEnabled()) logger.warn(message);
                    reject(message);
                });
        });
    };

    const queueName = `metaQ_${client.id}`;
    const jobName = `metaJ_${client.id}`;
    const META_HANDLERS: Record<string, (returnvalue: MobilettoMetadata) => unknown> = {};
    const META_ERR_HANDLERS: Record<string, (failedReason: string) => unknown> = {};
    const metaLoadQueue = () => {
        if (!client.mq) {
            if (!client.redisConfig) {
                const message = "metaLoadQueue: redis is required but not enabled";
                if (logger.isErrorEnabled()) logger.error(message);
                throw new MobilettoError(message);
            }
            const port: number = client.redisConfig.port || parseInt(`${REDIS_PORT}`);
            const queueOptions = {
                connection: {
                    host: client.redisConfig.host || REDIS_HOST,
                    port,
                },
                prefix: client.redisConfig.prefix + "_" + queueName,
            };
            const queue = new Queue(queueName, queueOptions);
            const workers: Worker[] = [];
            const numWorkers = enc.metaWorkers || DEFAULT_META_WORKERS;
            for (let i = 0; i < numWorkers; i++) {
                const worker = new Worker(queueName, async (job) => await _singleMeta(job), queueOptions);
                workers.push(worker);
            }

            const events = new QueueEvents(queueName, queueOptions);
            events.on("completed", ({ jobId, returnvalue }): void => {
                if (logger.isInfoEnabled())
                    logger.info(`${jobName} completed job ${jobId} with result: ${returnvalue}`);
                if (META_HANDLERS[jobId]) {
                    META_HANDLERS[jobId](JSON.parse(returnvalue));
                }
            });
            events.on("failed", ({ jobId, failedReason }): void => {
                if (logger.isInfoEnabled()) logger.info(`${jobName} failed job ${jobId} with result: ${failedReason}`);
                if (META_ERR_HANDLERS[jobId]) {
                    META_ERR_HANDLERS[jobId](failedReason);
                }
            });
            client.mq = { queue, workers, events };
            ALL_MQ[client.id] = client.mq;
        }
        return client.mq.queue;
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

        const mobilettoJobID = rand(10);
        const mq = metaLoadQueue();
        META_HANDLERS[mobilettoJobID] = (meta: MobilettoMetadata) => files.push(meta);
        META_ERR_HANDLERS[mobilettoJobID] = (failedReason) => {
            if (logger.isErrorEnabled()) logger.error(`_loadMeta(${dirent}): error: ${failedReason}`);
        };
        for (const entry of entries) {
            const job = { mobilettoJobID, dirent, entry };
            await mq.add(jobName, job);
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

        if (logger.isDebugEnabled()) logger.debug(`removeDirentFile(${path}) removing df=${df}`);
        await client.remove(df, recursive, quiet);

        if (logger.isDebugEnabled())
            logger.debug(`removeDirentFile(${path}) removing encryptPath(path)=${encryptPath(path)}`);
        await client.remove(encryptPath(path), recursive, quiet);

        if (logger.isDebugEnabled())
            logger.debug(`removeDirentFile(${path}) removing metaPath(path)=${metaPath(path)}`);
        await client.remove(metaPath(path), recursive, quiet);
    }

    // noinspection JSUnusedGlobalSymbols
    const encClient: MobilettoMinimalClient = {
        id: internalIdForDriver(),
        redisConfig: client.redisConfig,
        testConfig: client.testConfig,
        info: client.info,
        flags: client.flags ? client.flags : undefined,
        list: async (
            pth = "",
            optsOrRecursive?: MobilettoListOptions | boolean,
            visitor?: MobilettoVisitor
        ): Promise<MobilettoMetadata[]> => {
            const p = pth === "" ? "." : pth.endsWith("/") ? pth.substring(0, pth.length - 1) : pth;
            const dirent = direntDir(p);
            let entries: MobilettoMetadata[];
            const recursive = optsOrRecursive === true || (optsOrRecursive && optsOrRecursive.recursive) || false;
            visitor = visitor
                ? visitor
                : typeof optsOrRecursive === "object" && optsOrRecursive.visitor
                ? optsOrRecursive.visitor
                : undefined;
            const cacheKey = `${p} ~ ${recursive}`;
            const cache = visitor ? null : client.scopedCache("enc_list");
            const cached: MobilettoMetadata[] | null | undefined = cache && (await cache.get(cacheKey));

            function cacheAndReturn(thing: MobilettoMetadata[]): MobilettoMetadata[] {
                if (cache) {
                    cache.set(cacheKey, thing).then(
                        () => {
                            if (logger.isDebugEnabled()) logger.debug(`enc_list: cached ${p} r=${recursive}`);
                        },
                        (err: Error) => {
                            if (logger.isErrorEnabled()) logger.error(`enc_list(${p}) error: ${err}`);
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
                    if (logger.isDebugEnabled()) logger.debug(`tryParentDirForSingleFile(${p}) found ${found.name}`);
                    return cacheAndReturn([found]);
                }
                if (logger.isDebugEnabled()) logger.debug(`tryParentDirForSingleFile(${p}) nothing found! e=${e}`);
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
                                if (logger.isDebugEnabled()) logger.debug(`enc_list: cached ${p} r=${recursive}`);
                            },
                            (err: Error) => {
                                if (logger.isErrorEnabled()) logger.error(`enc_list(${p}) error: ${err}`);
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
                        if (logger.isDebugEnabled()) logger.debug(`enc_list: cached ${p} r=${recursive}`);
                    },
                    (err: Error) => {
                        if (logger.isErrorEnabled()) logger.error(`enc_list(${p}) error: ${err}`);
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
            if (logger.isDebugEnabled()) logger.debug(`enc.remove(${path}) starting`);
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
                            if (logger.isWarningEnabled())
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
    if (logger.isInfoEnabled())
        logger.info(
            `mobiletto: successfully connected using driver ${driverPath}, returning client (encryption enabled)`
        );
    return addUtilityFunctions(addCacheFunctions(encClient), readOnly);
}

export async function connect(
    driverPath: string,
    key: string,
    secret?: string | null,
    opts?: MobilettoOptions | null,
    encryption?: MobilettoEncryptionSettings
): Promise<MobilettoConnection> {
    return await mobiletto(driverPath, key, secret, opts, encryption);
}
