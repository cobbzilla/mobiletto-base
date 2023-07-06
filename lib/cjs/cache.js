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
exports.DISABLED_CACHE = exports.AwaitableLRU = void 0;
const mjs_1 = require("lru-cache/dist/mjs");
class AwaitableLRU {
    constructor(size = 100) {
        this.get = (key) => __awaiter(this, void 0, void 0, function* () {
            const val = this.lru.get(key);
            return val ? JSON.parse(val) : null;
        });
        this.set = (key, value) => __awaiter(this, void 0, void 0, function* () {
            this.lru.set(key, JSON.stringify(value));
        });
        this.flush = () => __awaiter(this, void 0, void 0, function* () { return Promise.resolve(this.lru.clear()); });
        this.lru = new mjs_1.LRUCache({ max: size });
    }
}
exports.AwaitableLRU = AwaitableLRU;
class DisabledCache {
    constructor() {
        this.get = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
        this.set = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
        this.flush = () => __awaiter(this, void 0, void 0, function* () {
            /* noop */
        });
    }
}
exports.DISABLED_CACHE = new DisabledCache();
