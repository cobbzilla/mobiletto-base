import { teardown } from "./redis.js";
import { MobilettoDriver, MobilettoDriverParameter } from "./types.js";
import { logger, MobilettoError } from "mobiletto-common";
import { ALL_META_WORKERS } from "./mobiletto";

export const shutdownMobiletto = async () => {
    const workerClosePromises: Promise<void>[] = [];
    ALL_META_WORKERS.forEach((w) =>
        workerClosePromises.push(
            new Promise((resolve, reject) => {
                w.close(true)
                    .then(() => resolve)
                    .catch((e) => {
                        logger.info(`shutdownMobiletto: error closing queue worker: ${e}`);
                        reject(e);
                    });
            })
        )
    );
    try {
        const closeResults = await Promise.all(workerClosePromises);
        logger.info(`shutdownMobiletto: closeResults: ${closeResults}`);
    } catch (e) {
        logger.warn(`shutdownMobiletto: error cleaning up queue workers: ${e}`);
    }
    try {
        await teardown();
    } catch (e) {
        logger.warn(`shutdownMobiletto: error cleaning up cache: ${e}`);
    }
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
