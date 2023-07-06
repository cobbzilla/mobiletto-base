import { MobilettoDriver, MobilettoDriverParameter } from "./types.js";
export declare const closeRedis: () => Promise<void>;
export declare const ALL_DRIVERS: Record<string, MobilettoDriver>;
export declare const registerDriver: (name: string, driver: MobilettoDriverParameter) => MobilettoDriver;
