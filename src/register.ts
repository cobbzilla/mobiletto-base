import { teardown } from "./redis.js";
import { MobilettoDriver, MobilettoDriverParameter } from "./types.js";
import { logger, MobilettoError } from "mobiletto-common";
import { ALL_QUEUE_EVENTS, ALL_WORKERS } from "./mobiletto";

export const shutdownMobiletto = async () => {
    const closePromises: Promise<void>[] = [];
    ALL_WORKERS.forEach((w) => closePromises.push(w.close(true)));
    ALL_QUEUE_EVENTS.forEach((qe) => closePromises.push(qe.close()));
    await Promise.all(closePromises);
    await teardown();
};

export const ALL_DRIVERS: Record<string, MobilettoDriver> = {};

export const registerDriver = (name: string, driver: MobilettoDriverParameter): MobilettoDriver => {
    if (ALL_DRIVERS[name]) {
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
