"use strict";

function isObject(x) {
    const type = typeof x;
    return type === "object" || type === "function";
}
function assignKey(to, from, key) {
    const value = from[key];
    // https://github.com/electron-userland/electron-builder/pull/562
    if (value === undefined) {
        return;
    }
    const prevValue = to[key];
    if (prevValue == null || value === null || typeof prevValue !== "object" || !isObject(value)) {
        to[key] = value;
    } else {
        to[key] = assign(prevValue, value);
    }
}
function assign(to, from) {
    if (to !== from) {
        for (let key of Object.getOwnPropertyNames(from)) {
            assignKey(to, from, key);
        }
    }
    return to;
}
function deepAssign(target) {
    for (var _len = arguments.length, objects = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        objects[_key - 1] = arguments[_key];
    }

    for (let o of objects) {
        if (o != null) {
            assign(target, o);
        }
    }
    return target;
}
exports.deepAssign = deepAssign;
//# sourceMappingURL=deepAssign.js.map