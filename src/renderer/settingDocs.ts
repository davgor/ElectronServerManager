/**
 * Config editor tooltip lookup. The catalog keys docs by setting path with
 * array indexes written as `*` (`userGroups.*.canKickBan`), so every entry of
 * an array shares one description.
 */
export function settingDocPath(path: readonly string[]): string {
  return path
    .map((segment) => (/^\d+$/.test(segment) ? "*" : segment))
    .join(".");
}

export function findSettingDoc(
  docs: Record<string, string> | undefined,
  path: readonly string[]
): string | undefined {
  if (docs === undefined) {
    return undefined;
  }
  const key = settingDocPath(path);
  return Object.prototype.hasOwnProperty.call(docs, key)
    ? docs[key]
    : undefined;
}
