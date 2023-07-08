import { MobilettoMinimalClient, MobilettoFeatureFlagName } from "mobiletto-common";
import { MobilettoClient } from "./types.js";
export declare const isFlagEnabled: (client: MobilettoMinimalClient, flag: MobilettoFeatureFlagName, defaultValue?: boolean) => boolean;
export declare const addUtilityFunctions: (client: MobilettoMinimalClient, readOnly?: boolean) => MobilettoClient;
export declare const addCacheFunctions: (client: MobilettoMinimalClient) => MobilettoMinimalClient;
