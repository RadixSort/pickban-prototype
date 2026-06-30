function createTtlCache({ maxEntries, ttlMs, now = Date.now } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError("maxEntries must be a positive integer.");
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive number.");
  }

  const entries = new Map();

  function get(key) {
    const entry = entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }

    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function set(key, value, entryTtlMs = ttlMs) {
    entries.delete(key);
    entries.set(key, {
      expiresAt: now() + entryTtlMs,
      value,
    });

    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }

    return value;
  }

  return {
    clear: () => entries.clear(),
    delete: (key) => entries.delete(key),
    get,
    set,
  };
}

module.exports = {
  createTtlCache,
};
