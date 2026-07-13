export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function primitiveMatches(value: unknown, query: string): boolean {
  if (value === null || value === undefined || typeof value === "object") {
    return false;
  }
  return String(value).toLowerCase().includes(query);
}

/**
 * True if `value` (or any nested key/value) case-insensitively contains `query`.
 * `query` must already be normalized (trimmed + lowercased).
 */
export function valueMatches(value: unknown, query: string): boolean {
  if (query === "") {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value !== "object") {
    return String(value).toLowerCase().includes(query);
  }
  if (Array.isArray(value)) {
    return value.some(
      (item, idx) => String(idx).includes(query) || valueMatches(item, query)
    );
  }
  return Object.entries(value as Record<string, unknown>).some(
    ([k, v]) => k.toLowerCase().includes(query) || valueMatches(v, query)
  );
}

function pushUnique(paths: string[], path: string): void {
  if (path !== "" && !paths.includes(path)) {
    paths.push(path);
  }
}

function addAncestorPaths(pathPrefix: string, expandPaths: string[]): void {
  if (pathPrefix === "") {
    return;
  }
  const parts = pathPrefix.split(".");
  let acc = "";
  for (const part of parts) {
    acc = acc === "" ? part : `${acc}.${part}`;
    pushUnique(expandPaths, acc);
  }
}

function keyMatches(key: string, query: string): boolean {
  return key.toLowerCase().includes(query);
}

function isObject(
  value: unknown
): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

/**
 * When a container has matching descendants, expand paths so those matches are visible.
 */
function expandMatchingContainers(
  value: unknown,
  pathStr: string,
  query: string,
  expandPaths: string[]
): void {
  if (!isObject(value)) {
    return;
  }
  pushUnique(expandPaths, pathStr);
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      if (isObject(item) && valueMatches(item, query)) {
        expandMatchingContainers(item, `${pathStr}.${idx}`, query, expandPaths);
      }
    });
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (keyMatches(k, query) || primitiveMatches(v, query)) {
      continue;
    }
    if (isObject(v) && valueMatches(v, query)) {
      expandMatchingContainers(v, `${pathStr}.${k}`, query, expandPaths);
    }
  }
}

function pathFor(pathPrefix: string, key: string): string {
  return pathPrefix === "" ? key : `${pathPrefix}.${key}`;
}

function filterObject(
  obj: Record<string, unknown>,
  pathPrefix: string,
  query: string,
  expandPaths: string[]
): Record<string, unknown> {
  const leafHits: Array<[string, unknown]> = [];
  const containerKeyHits: Array<[string, unknown]> = [];
  const nestedHits: Array<[string, unknown]> = [];

  for (const [key, value] of Object.entries(obj)) {
    if (keyMatches(key, query)) {
      if (isObject(value)) {
        containerKeyHits.push([key, value]);
      } else {
        leafHits.push([key, value]);
      }
    } else if (primitiveMatches(value, query)) {
      leafHits.push([key, value]);
    } else if (isObject(value) && valueMatches(value, query)) {
      nestedHits.push([key, value]);
    }
  }

  if (
    leafHits.length === 0 &&
    containerKeyHits.length === 0 &&
    nestedHits.length === 0
  ) {
    return {};
  }

  // Nested object with a leaf hit: keep siblings for context.
  if (leafHits.length > 0 && pathPrefix !== "") {
    addAncestorPaths(pathPrefix, expandPaths);
    for (const [key, value] of [...containerKeyHits, ...nestedHits]) {
      if (isObject(value)) {
        expandMatchingContainers(
          value,
          pathFor(pathPrefix, key),
          query,
          expandPaths
        );
      }
    }
    return obj;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of leafHits) {
    result[key] = value;
  }

  for (const [key, value] of containerKeyHits) {
    result[key] = value;
    addAncestorPaths(pathPrefix, expandPaths);
    expandMatchingContainers(
      value,
      pathFor(pathPrefix, key),
      query,
      expandPaths
    );
  }

  for (const [key, value] of nestedHits) {
    const pathStr = pathFor(pathPrefix, key);
    if (Array.isArray(value)) {
      result[key] = value;
      addAncestorPaths(pathPrefix, expandPaths);
      expandMatchingContainers(value, pathStr, query, expandPaths);
      continue;
    }
    const child = filterObject(
      value as Record<string, unknown>,
      pathStr,
      query,
      expandPaths
    );
    if (Object.keys(child).length > 0) {
      result[key] = child;
      addAncestorPaths(pathPrefix, expandPaths);
      pushUnique(expandPaths, pathStr);
    }
  }

  return result;
}

export function filterConfigTree(
  config: Record<string, unknown>,
  query: string
): { filtered: Record<string, unknown>; expandPaths: string[] } {
  const normalized = normalizeQuery(query);
  if (normalized === "") {
    return { filtered: config, expandPaths: [] };
  }

  const expandPaths: string[] = [];
  const filtered = filterObject(config, "", normalized, expandPaths);
  return { filtered, expandPaths };
}
