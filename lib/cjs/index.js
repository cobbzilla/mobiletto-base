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
exports.flushAll = exports.closeRedis = exports.registerDriver = exports.mobiletto = exports.decrypt = exports.encrypt = exports.MobilettoNotFoundError = exports.MobilettoError = exports.connect = void 0;
const mobiletto_js_1 = require("./mobiletto.js");
Object.defineProperty(exports, "mobiletto", { enumerable: true, get: function () { return mobiletto_js_1.mobiletto; } });
function connect(driverPath, key, secret, opts, encryption) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield (0, mobiletto_js_1.mobiletto)(driverPath, key, secret, opts, encryption);
    });
}
exports.connect = connect;
var mobiletto_common_1 = require("mobiletto-common");
Object.defineProperty(exports, "MobilettoError", { enumerable: true, get: function () { return mobiletto_common_1.MobilettoError; } });
Object.defineProperty(exports, "MobilettoNotFoundError", { enumerable: true, get: function () { return mobiletto_common_1.MobilettoNotFoundError; } });
var crypt_js_1 = require("./crypt.js");
Object.defineProperty(exports, "encrypt", { enumerable: true, get: function () { return crypt_js_1.encrypt; } });
Object.defineProperty(exports, "decrypt", { enumerable: true, get: function () { return crypt_js_1.decrypt; } });
var register_js_1 = require("./register.js");
Object.defineProperty(exports, "registerDriver", { enumerable: true, get: function () { return register_js_1.registerDriver; } });
Object.defineProperty(exports, "closeRedis", { enumerable: true, get: function () { return register_js_1.closeRedis; } });
var redis_js_1 = require("./redis.js");
Object.defineProperty(exports, "flushAll", { enumerable: true, get: function () { return redis_js_1.flushAll; } });
