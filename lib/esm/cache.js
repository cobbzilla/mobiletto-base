var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { LRUCache } from "lru-cache";
export class AwaitableLRU {
    constructor(size = 100) {
        this.get = (key) => __awaiter(this, void 0, void 0, function* () {
            const val = this.lru.get(key);
            return val ? JSON.parse(val) : null;
        });
        this.set = (key, value) => __awaiter(this, void 0, void 0, function* () {
            this.lru.set(key, JSON.stringify(value));
        });
        this.flush = () => __awaiter(this, void 0, void 0, function* () { return Promise.resolve(this.lru.clear()); });
        this.disconnect = () => {
            /* noop */
        };
        this.lru = new LRUCache({ max: size });
    }
}
class DisabledCache {
    constructor() {
        this.get = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
        this.set = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
        this.flush = () => __awaiter(this, void 0, void 0, function* () {
            /* noop */
        });
        this.disconnect = () => {
            /* noop */
        };
    }
}
export const DISABLED_CACHE = new DisabledCache();
//# sourceMappingURL=cache.js.map