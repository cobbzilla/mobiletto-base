import { teardown } from "./redis";
import { MobilettoDriver, MobilettoDriverParameter } from "./types";
import { logger, MobilettoError } from "mobiletto-common";

export const closeRedis = async () => {
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
