import { teardown } from "./redis.js";
import { MobilettoDriver, MobilettoDriverParameter } from "./types.js";
import { logger, MobilettoError } from "mobiletto-common";
import { ALL_MQ } from "./mobiletto.js";

export const shutdownMobiletto = async () => {
    const workerPromises: Promise<void>[] = [];
    const eventsPromises: Promise<void>[] = [];
    const queuePromises: Promise<void>[] = [];
    const clientIds = Object.keys(ALL_MQ);
    clientIds.forEach((id) => {
        const mq = ALL_MQ[id];
        mq.workers.forEach((w) => workerPromises.push(w.close(true)));
        eventsPromises.push(mq.events.close());
        queuePromises.push(mq.queue.close());
        delete ALL_MQ[id];
    });
    await Promise.all(workerPromises);
    await Promise.all(eventsPromises);
    await Promise.all(queuePromises);
    await teardown();
};

export const ALL_DRIVERS: Record<string, MobilettoDriver> = {};

export const registerDriver = (name: string, driver: MobilettoDriverParameter): MobilettoDriver => {
    if (ALL_DRIVERS[name]) {
        if (logger.isWarningEnabled())
            logger.warn(`registerDriver(${name}): driver already registered, not re-registering`);
    } else {
        if (typeof driver === "object" && typeof driver.storageClient === "function") {
            ALL_DRIVERS[name] = driver;
        } else if (typeof driver === "function") {
            ALL_DRIVERS[name] = { storageClient: driver };
        } else {
            throw new MobilettoError(
                `registerDriver(${name}): expected function or object with storageClient function`
            );
        }
    }
    return ALL_DRIVERS[name];
};
