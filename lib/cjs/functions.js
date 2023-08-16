"use strict";
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
exports.addCacheFunctions = exports.addUtilityFunctions = exports.isFlagEnabled = void 0;
const mobiletto_common_1 = require("mobiletto-common");
const shasum_1 = __importDefault(require("shasum"));
const fs_1 = __importDefault(require("fs"));
const cache_js_1 = require("./cache.js");
const redis_js_1 = require("./redis.js");
const util_js_1 = require("./util.js");
const mobiletto_js_1 = require("./mobiletto.js");
function mirrorDir(source, sourcePath, visitor) {
    return __awaiter(this, void 0, void 0, function* () {
        if (mobiletto_common_1.logger.isTraceEnabled())
            mobiletto_common_1.logger.trace(`mirrorDir: mirroring dir: ${sourcePath}`);
        const listing = yield source.list(sourcePath, { recursive: false, visitor });
        for (const obj of listing) {
            if (obj.type === mobiletto_common_1.M_DIR) {
                const dir = obj.name.startsWith(sourcePath) ? obj.name : sourcePath + obj.name;
                yield mirrorDir(source, dir, visitor);
            }
        }
    });
}
const isFlagEnabled = (client, flag, defaultValue) => {
    if (client && typeof client.flags === "function") {
        const flags = client.flags();
        return (flags && flags[flag] === true) || defaultValue || false;
    }
    return false;
};
exports.isFlagEnabled = isFlagEnabled;
const READ_FILE_CACHE_SIZE_THRESHOLD = 128 * 1024; // we can cache files of this size
// noinspection JSUnusedGlobalSymbols,JSUnresolvedFunction
const UTILITY_FUNCTIONS = {
    list: (client) => (path, opts, visitor) => __awaiter(void 0, void 0, void 0, function* () {
        path || (path = "");
        const cache = client.scopedCache("list");
        const cached = cache ? yield cache.get(path) : null;
        if (cached) {
            if (Array.isArray(cached)) {
                return cached;
            }
            else if (cached instanceof Error) {
                throw cached;
            }
            else {
                if (mobiletto_common_1.logger.isWarningEnabled())
                    mobiletto_common_1.logger.warn(`list(${path}): unrecognized cached value (${cached})`);
            }
        }
        const recursive = opts && (opts === true || (opts.recursive ? opts.recursive : false));
        visitor = visitor ? visitor : typeof opts === "object" && opts.visitor ? opts.visitor : undefined;
        if (visitor && typeof visitor !== "function") {
            throw new mobiletto_common_1.MobilettoError(`list: visitor is not a function: ${typeof visitor}`);
        }
        try {
            // noinspection JSUnresolvedFunction
            const results = yield client.driver_list(path, recursive, visitor);
            if (results) {
                if (results.length === 0 && (0, exports.isFlagEnabled)(client, "list_tryMetaIfEmpty")) {
                    // try single meta, is this a file?
                    try {
                        const singleFileMeta = yield client.driver_metadata(path);
                        if (singleFileMeta) {
                            results.push(singleFileMeta);
                        }
                    }
                    catch (sfmErrIgnored) {
                        // ignore error, we tried
                    }
                }
                if (cache) {
                    cache.set(path, results).then(() => {
                        if (mobiletto_common_1.logger.isDebugEnabled())
                            mobiletto_common_1.logger.debug(`list(${path}) cached ${results ? results.length : `unknown? ${JSON.stringify(results)}`} results`);
                    }, (err) => {
                        if (mobiletto_common_1.logger.isErrorEnabled())
                            mobiletto_common_1.logger.error(`list(${path}) error: ${err}`);
                    });
                }
            }
            return results;
        }
        catch (e) {
            if (cache && e instanceof mobiletto_common_1.MobilettoNotFoundError) {
                cache.set(path, e).then(() => {
                    if (mobiletto_common_1.logger.isDebugEnabled())
                        mobiletto_common_1.logger.debug(`list(${path}) cached error ${e}`);
                }, (err) => {
                    if (mobiletto_common_1.logger.isErrorEnabled())
                        mobiletto_common_1.logger.error(`list(${path}) error ${err} caching MobilettoNotFoundError`);
                });
            }
            throw e;
        }
    }),
    safeList: (client) => (path, opts, visitor) => __awaiter(void 0, void 0, void 0, function* () {
        const recursive = (opts && opts === true) || (typeof opts === "object" && opts.recursive ? opts.recursive : false);
        visitor = visitor ? visitor : typeof opts === "object" && opts.visitor ? opts.visitor : undefined;
        try {
            // noinspection JSUnresolvedFunction
            return yield client.driver_list(path, recursive, visitor);
        }
        catch (e) {
            if (e instanceof mobiletto_common_1.MobilettoNotFoundError) {
                return [];
            }
            throw e;
        }
    }),
    metadata: (client) => (path) => __awaiter(void 0, void 0, void 0, function* () {
        const cache = client.scopedCache("metadata");
        const cached = cache ? yield cache.get(path) : null;
        if (cached) {
            return cached;
        }
        // noinspection JSUnresolvedFunction
        const meta = yield client.driver_metadata(path);
        if (cache) {
            cache.set(path, meta).then(() => {
                if (mobiletto_common_1.logger.isDebugEnabled())
                    mobiletto_common_1.logger.debug(`metadata(${path}) cached meta = ${JSON.stringify(meta)}`);
            }, (err) => {
                if (mobiletto_common_1.logger.isErrorEnabled())
                    mobiletto_common_1.logger.error(`metadata(${path}) error: ${err}`);
            });
        }
        return meta;
    }),
    safeMetadata: (client) => (path) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            return yield client.metadata(path);
        }
        catch (e) {
            if (e instanceof mobiletto_common_1.MobilettoNotFoundError) {
                return null;
            }
            throw e;
        }
    }),
    remove: (client) => (path, opts) => __awaiter(void 0, void 0, void 0, function* () {
        const recursive = opts && opts.recursive ? opts.recursive : false;
        // noinspection JSUnresolvedVariable
        const quiet = opts && opts.quiet ? opts.quiet : false;
        // noinspection JSUnresolvedFunction
        const result = yield client.driver_remove(path, recursive, quiet);
        yield client.flush();
        return result;
    }),
    readFile: (client) => (path) => __awaiter(void 0, void 0, void 0, function* () {
        const cache = client.scopedCache("readFile");
        const cached = cache ? yield cache.get(path) : null;
        if (cached) {
            return Buffer.from(cached, "base64");
        }
        const chunks = [];
        yield client.read(path, (0, util_js_1.reader)(chunks));
        const data = Buffer.concat(chunks);
        if (cache && data.length < READ_FILE_CACHE_SIZE_THRESHOLD) {
            yield cache.set(path, data.toString("base64"));
        }
        return data;
    }),
    safeReadFile: (client) => (path) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            return yield client.readFile(path);
        }
        catch (e) {
            if (mobiletto_common_1.logger.isInfoEnabled())
                mobiletto_common_1.logger.info(`safeReadFile(${path}) ${e}`);
            return Buffer.from("");
        }
    }),
    write: (client) => (path, data) => __awaiter(void 0, void 0, void 0, function* () {
        if (mobiletto_common_1.logger.isDebugEnabled())
            mobiletto_common_1.logger.debug(`util.write(${path}) starting ...`);
        const p = path.startsWith("/") ? path.substring(1) : path;
        if (p !== path) {
            if (mobiletto_common_1.logger.isDebugEnabled())
                mobiletto_common_1.logger.debug(`util.write(${path}) removed leading /`);
        }
        // noinspection JSUnresolvedFunction
        const bytesWritten = yield client.driver_write(p, data);
        yield client.flush();
        if (mobiletto_common_1.logger.isDebugEnabled())
            mobiletto_common_1.logger.debug(`util.write(${p}) wrote ${bytesWritten} bytes`);
        return bytesWritten;
    }),
    writeFile: (client) => (path, data) => __awaiter(void 0, void 0, void 0, function* () {
        const readFunc = function* () {
            yield data;
        };
        return yield client.write(path, readFunc());
    }),
    mirror: (client) => (source, clientPath = "", sourcePath = "") => __awaiter(void 0, void 0, void 0, function* () {
        if (mobiletto_common_1.logger.isInfoEnabled())
            mobiletto_common_1.logger.info(`mirror: starting, sourcePath=${sourcePath} -> clientPath=${clientPath}`);
        const results = {
            success: 0,
            errors: 0,
        };
        const visitor = (obj) => __awaiter(void 0, void 0, void 0, function* () {
            if (obj.type && obj.type === mobiletto_common_1.M_FILE) {
                if (mobiletto_common_1.logger.isTraceEnabled())
                    mobiletto_common_1.logger.trace(`mirror: mirroring file: ${obj.name}`);
                const tempPath = `${util_js_1.MOBILETTO_TMP}/mobiletto_${(0, shasum_1.default)(JSON.stringify(obj))}.${(0, mobiletto_common_1.rand)(10)}`;
                if (mobiletto_common_1.logger.isDebugEnabled())
                    mobiletto_common_1.logger.debug(`mirror: writing ${obj.name} to temp file ${tempPath} ...`);
                const destName = obj.name.startsWith(sourcePath) ? obj.name.substring(sourcePath.length) : obj.name;
                const destFullPath = (clientPath.endsWith("/") ? clientPath : clientPath + "/") +
                    (destName.startsWith("/") ? destName.substring(1) : destName);
                try {
                    // if dest already exists and is the same size, don't copy it again
                    let srcSize = null;
                    if (obj.size) {
                        srcSize = obj.size;
                    }
                    else {
                        const srcMeta = yield source.safeMetadata(obj.name);
                        if (srcMeta && srcMeta.size) {
                            srcSize = srcMeta.size;
                        }
                    }
                    // only continue if we could determine the source size
                    if (srcSize) {
                        const destMeta = yield client.safeMetadata(destFullPath);
                        if (destMeta && destMeta.size && destMeta.size && destMeta.size === srcSize) {
                            if (mobiletto_common_1.logger.isInfoEnabled())
                                mobiletto_common_1.logger.info(`mirror: dest object (${destFullPath}) has same size (${srcSize}) as src object ${sourcePath}, not copying`);
                            return;
                        }
                    }
                    // write from source -> write to temp file
                    const fd = fs_1.default.openSync(tempPath, "wx", 0o0600);
                    const writer = fs_1.default.createWriteStream(tempPath, { fd, flags: "wx" });
                    yield new Promise((resolve, reject) => {
                        source
                            .read(obj.name, (chunk) => __awaiter(void 0, void 0, void 0, function* () {
                            if (chunk) {
                                writer.write(chunk);
                            }
                        }), () => {
                            writer.close((err) => {
                                if (err) {
                                    throw new mobiletto_common_1.MobilettoError(`mirror: error closing temp file: ${err}`);
                                }
                                if (mobiletto_common_1.logger.isDebugEnabled())
                                    mobiletto_common_1.logger.debug(`mirror: finished writing ${obj.name} to temp file ${tempPath}`);
                            });
                        })
                            .then(() => __awaiter(void 0, void 0, void 0, function* () {
                            // read from temp file -> write to mirror
                            const fd = fs_1.default.openSync(tempPath, "r");
                            const reader = fs_1.default.createReadStream(tempPath, { fd });
                            if (mobiletto_common_1.logger.isDebugEnabled())
                                mobiletto_common_1.logger.debug(`mirror: writing temp file ${tempPath} to destination: ${destFullPath}`);
                            yield client.write(destFullPath, reader);
                            if (mobiletto_common_1.logger.isDebugEnabled())
                                mobiletto_common_1.logger.debug(`mirror: finished writing temp file ${tempPath} to destination: ${destFullPath}`);
                            results.success++;
                            resolve(destFullPath);
                        }))
                            .catch((e) => {
                            if (mobiletto_common_1.logger.isWarningEnabled())
                                mobiletto_common_1.logger.warn(`mirror: error copying file: ${e}`);
                            results.errors++;
                            reject(e);
                        });
                    });
                }
                catch (e) {
                    if (mobiletto_common_1.logger.isWarningEnabled())
                        mobiletto_common_1.logger.warn(`mirror: error copying file: ${e}`);
                    results.errors++;
                }
                finally {
                    if (mobiletto_common_1.logger.isTraceEnabled())
                        mobiletto_common_1.logger.trace(`mirror: file mirrored successfully: ${obj.name}`);
                    fs_1.default.rmSync(tempPath, { force: true });
                }
            }
        });
        yield mirrorDir(source, sourcePath, visitor);
        return results;
    }),
    destroy: (client) => () => __awaiter(void 0, void 0, void 0, function* () {
        if (client.mq) {
            const workerClosePromises = [];
            client.mq.workers.forEach((w) => workerClosePromises.push(w.close(true)));
            yield Promise.all(workerClosePromises);
            yield client.mq.events.close();
            yield client.mq.queue.close();
            delete mobiletto_js_1.ALL_MQ[client.id];
        }
        const cache = client.getCache();
        if (cache) {
            cache.disconnect();
        }
    }),
};
const CACHE_FUNCTIONS = {
    getCache: (client) => () => {
        if (typeof client.cache !== "undefined")
            return client.cache;
        const redisConfig = client.redisConfig || {};
        const enabled = redisConfig.enabled !== false;
        if (!enabled) {
            if (mobiletto_common_1.logger.isInfoEnabled())
                mobiletto_common_1.logger.info(`getCache: client.redisConfig.enabled === false, disabling cache`);
            client.cache = cache_js_1.DISABLED_CACHE;
            return client.cache;
        }
        const host = redisConfig.host || redis_js_1.REDIS_HOST;
        const port = redisConfig.port || parseInt(`${redis_js_1.REDIS_PORT}`);
        const prefix = redisConfig.prefix || redis_js_1.REDIS_PREFIX;
        if (!client.id) {
            if (mobiletto_common_1.logger.isWarningEnabled())
                mobiletto_common_1.logger.warn(`getCache: client.id not set; all nameless connections will share one cache`);
            client.cache = (0, redis_js_1.getRedis)("~nameless~", host, port, prefix);
        }
        else {
            client.cache = (0, redis_js_1.getRedis)(client.id, host, port, prefix);
        }
        return client.cache;
    },
    scopedCache: (client) => (cacheName, size = 100) => {
        const cache = client.getCache();
        return cache instanceof redis_js_1.MobilettoCache ? cache.scopedCache(cacheName, size) : new cache_js_1.AwaitableLRU(size);
    },
    flush: (client) => () => __awaiter(void 0, void 0, void 0, function* () {
        yield client.getCache().flush();
    }),
};
function utilityFunctionConflict(client, func) {
    if (typeof client[func] === "function") {
        if (typeof client[`driver_${func}`] !== "undefined") {
            if (mobiletto_common_1.logger.isWarningEnabled())
                mobiletto_common_1.logger.warn(`utilityFunctionConflict: driver_${func} has already been added`);
            return false;
        }
        else {
            client[`driver_${func}`] = client[func]; // save original driver function
            return true;
        }
    }
    else if (typeof client[func] !== "undefined") {
        throw new mobiletto_common_1.MobilettoError(`utilityFunctionConflict: client defines a property ${func}, mobiletto function would overwrite`);
    }
    else {
        return false;
    }
}
const addUtilityFunctions = (client, readOnly = false) => {
    addClientFunctions(client, UTILITY_FUNCTIONS, utilityFunctionConflict);
    if (readOnly) {
        for (const writeFunc of ["write", "remove", "writeFile"]) {
            client[writeFunc] = () => __awaiter(void 0, void 0, void 0, function* () {
                if (mobiletto_common_1.logger.isWarningEnabled())
                    mobiletto_common_1.logger.warn(`${writeFunc} not supported in readOnly mode`);
                return false;
            });
        }
    }
    return client;
};
exports.addUtilityFunctions = addUtilityFunctions;
const addCacheFunctions = (client) => addClientFunctions(client, CACHE_FUNCTIONS, (client, func) => {
    if (mobiletto_common_1.logger.isWarningEnabled())
        mobiletto_common_1.logger.warn(`addCacheFunctions: ${func} already exists on client${client.id ? `(client.id=${client.id})` : ""}, not re-adding`);
    return false;
});
exports.addCacheFunctions = addCacheFunctions;
const addClientFunctions = (client, functions, conflictFunc) => {
    for (const func of Object.keys(functions)) {
        let add = true;
        if (client[func]) {
            add = conflictFunc ? conflictFunc(client, func) : false;
        }
        if (add) {
            client[func] = functions[func](client);
        }
    }
    return client;
};
