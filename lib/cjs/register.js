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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDriver = exports.ALL_DRIVERS = exports.shutdownMobiletto = void 0;
const redis_js_1 = require("./redis.js");
const mobiletto_common_1 = require("mobiletto-common");
const mobiletto_1 = require("./mobiletto");
const shutdownMobiletto = () => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, redis_js_1.teardown)();
    const workerClosePromises = [];
    mobiletto_1.ALL_META_WORKERS.forEach((w) => workerClosePromises.push(w.close(true)));
    yield Promise.all(workerClosePromises);
});
exports.shutdownMobiletto = shutdownMobiletto;
exports.ALL_DRIVERS = {};
const registerDriver = (name, driver) => {
    if (exports.ALL_DRIVERS[name]) {
        mobiletto_common_1.logger.warn(`registerDriver(${name}): driver already registered, not re-registering`);
    }
    else {
        if (typeof driver === "object" && typeof driver.storageClient === "function") {
            exports.ALL_DRIVERS[name] = driver;
        }
        else if (typeof driver === "function") {
            exports.ALL_DRIVERS[name] = { storageClient: driver };
        }
        else {
            throw new mobiletto_common_1.MobilettoError(`registerDriver(${name}): expected function or object with storageClient function`);
        }
    }
    return exports.ALL_DRIVERS[name];
};
exports.registerDriver = registerDriver;
