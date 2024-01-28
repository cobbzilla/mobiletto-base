var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { teardown } from "./redis.js";
import { logger, MobilettoError } from "mobiletto-common";
import { ALL_MQ } from "./mobiletto.js";
export const shutdownMobiletto = () => __awaiter(void 0, void 0, void 0, function* () {
    const workerPromises = [];
    const eventsPromises = [];
    const queuePromises = [];
    const clientIds = Object.keys(ALL_MQ);
    clientIds.forEach((id) => {
        const mq = ALL_MQ[id];
        mq.workers.forEach((w) => workerPromises.push(w.close(true)));
        eventsPromises.push(mq.events.close());
        queuePromises.push(mq.queue.close());
        delete ALL_MQ[id];
    });
    yield Promise.all(workerPromises);
    yield Promise.all(eventsPromises);
    yield Promise.all(queuePromises);
    yield teardown();
});
export const ALL_DRIVERS = {};
export const registerDriver = (name, driver) => {
    if (ALL_DRIVERS[name]) {
        if (logger.isWarningEnabled())
            logger.warn(`registerDriver(${name}): driver already registered, not re-registering`);
    }
    else {
        if (typeof driver === "object" && typeof driver.storageClient === "function") {
            ALL_DRIVERS[name] = driver;
        }
        else if (typeof driver === "function") {
            ALL_DRIVERS[name] = { storageClient: driver };
        }
        else {
            throw new MobilettoError(`registerDriver(${name}): expected function or object with storageClient function`);
        }
    }
    return ALL_DRIVERS[name];
};
//# sourceMappingURL=register.js.map