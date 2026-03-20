"use strict";

function resolveQwikPayload(payload) {
  if (!payload || !Array.isArray(payload._objs)) {
    throw new Error("Qwik payload must include an _objs array.");
  }

  return resolveQwikValue(payload._entry, payload._objs, new Map());
}

function resolveQwikValue(value, objects, referenceCache) {
  if (typeof value === "string") {
    const index = parseQwikRef(value, objects.length);
    if (index == null) {
      return value;
    }

    return resolveQwikReference(index, objects, referenceCache);
  }

  if (Array.isArray(value)) {
    const resolved = [];
    for (const entry of value) {
      resolved.push(resolveQwikValue(entry, objects, referenceCache));
    }
    return resolved;
  }

  if (value && typeof value === "object") {
    const resolved = {};
    for (const [key, entry] of Object.entries(value)) {
      resolved[key] = resolveQwikValue(entry, objects, referenceCache);
    }
    return resolved;
  }

  return value;
}

function resolveQwikReference(index, objects, referenceCache) {
  if (referenceCache.has(index)) {
    return referenceCache.get(index);
  }

  const raw = objects[index];

  if (Array.isArray(raw)) {
    const resolved = [];
    referenceCache.set(index, resolved);

    for (const entry of raw) {
      resolved.push(resolveQwikValue(entry, objects, referenceCache));
    }

    return resolved;
  }

  if (raw && typeof raw === "object") {
    const resolved = {};
    referenceCache.set(index, resolved);

    for (const [key, entry] of Object.entries(raw)) {
      resolved[key] = resolveQwikValue(entry, objects, referenceCache);
    }

    return resolved;
  }

  referenceCache.set(index, raw);
  return raw;
}

function parseQwikRef(value, objectCount) {
  if (!/^[0-9a-z]+$/i.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 36);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= objectCount) {
    return null;
  }

  return parsed;
}

module.exports = {
  parseQwikRef,
  resolveQwikPayload,
};
