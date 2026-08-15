/**
 * Resolve where a Palworld server mod zip should be installed.
 *
 * Official packages (root `Info.json` with PackageName) stage under
 * `Mods/Workshop/<folder>/`. Path-rooted archives (`Pal/...`, `Mods/...`)
 * deploy relative to the dedicated-server install root.
 */

export interface ZipEntryMeta {
  /** Forward-slash path as stored in the archive (directories may be omitted). */
  path: string;
}

export interface ResolvedZipFile {
  archivePath: string;
  /** Path relative to workshop package root OR server install root. */
  relativeTarget: string;
}

export type ModInstallKind = "workshop" | "path_deploy";

export interface ZipInstallPlan {
  kind: ModInstallKind;
  displayName: string;
  packageName: string | null;
  /** Suggested Workshop child folder name when kind is workshop. */
  workshopFolderName: string | null;
  files: ResolvedZipFile[];
}

export type ResolveZipResult =
  | { ok: true; plan: ZipInstallPlan }
  | { ok: false; error: string };

const PATH_ROOTS = ["Pal/", "Mods/"] as const;

function normalizeEntryPath(raw: string): string | null {
  const trimmed = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmed || trimmed.endsWith("/")) {
    return null;
  }
  const parts = trimmed.split("/");
  if (parts.some((p) => p === ".." || p === ".")) {
    return null;
  }
  return parts.join("/");
}

function hasTraversal(raw: string): boolean {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .some((p) => p === "..");
}

function commonSingleWrapper(paths: string[]): string | null {
  if (paths.length === 0) {
    return null;
  }
  const firstSegs = paths.map((p) => p.split("/")[0] ?? "");
  const candidate = firstSegs[0];
  if (!candidate || firstSegs.some((s) => s !== candidate)) {
    return null;
  }
  if (!paths.every((p) => p.includes("/"))) {
    return null;
  }
  return candidate;
}

function stripPrefix(path: string, prefix: string): string {
  const withSlash = `${prefix}/`;
  return path.startsWith(withSlash) ? path.slice(withSlash.length) : path;
}

function isPathRooted(path: string): boolean {
  return PATH_ROOTS.some(
    (root) => path === root.slice(0, -1) || path.startsWith(root)
  );
}

function findInfoJsonPath(paths: string[]): string | null {
  if (paths.includes("Info.json")) {
    return "Info.json";
  }
  const nested = paths.filter((p) => /^[^/]+\/Info\.json$/i.test(p));
  return nested.length === 1 ? (nested[0] ?? null) : null;
}

function parseInfoJson(
  bytes: Buffer | undefined
): { packageName: string; modName: string } | null {
  if (!bytes) {
    return null;
  }
  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as Record<
      string,
      unknown
    >;
    const packageName =
      typeof parsed.PackageName === "string" ? parsed.PackageName.trim() : "";
    if (!packageName) {
      return null;
    }
    const modName =
      typeof parsed.ModName === "string" && parsed.ModName.trim() !== ""
        ? parsed.ModName.trim()
        : packageName;
    return { packageName, modName };
  } catch {
    return null;
  }
}

function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "ImportedMod";
}

/**
 * Build an install plan from archive entry paths and optional file bytes
 * (needed to read `Info.json`).
 */
export function resolveZipDestination(
  entryMetas: ZipEntryMeta[],
  fileBytes: Record<string, Buffer> = {}
): ResolveZipResult {
  for (const meta of entryMetas) {
    if (hasTraversal(meta.path)) {
      return { ok: false, error: "Archive contains zip-slip path traversal" };
    }
  }

  const normalized = entryMetas
    .map((m) => normalizeEntryPath(m.path))
    .filter((p): p is string => p !== null);

  if (normalized.length === 0) {
    return { ok: false, error: "Archive is empty" };
  }

  const infoPath = findInfoJsonPath(normalized);
  if (infoPath) {
    const wrapper = infoPath.includes("/")
      ? (infoPath.split("/")[0] ?? null)
      : null;
    const relativePaths = wrapper
      ? normalized.map((p) => stripPrefix(p, wrapper)).filter(Boolean)
      : normalized;
    const infoBytes =
      fileBytes[infoPath] ??
      (wrapper ? fileBytes[`${wrapper}/Info.json`] : undefined) ??
      fileBytes["Info.json"];
    const info = parseInfoJson(infoBytes);
    if (!info) {
      return {
        ok: false,
        error: "Info.json is missing PackageName or is invalid JSON",
      };
    }
    const files: ResolvedZipFile[] = relativePaths.map((relativeTarget) => ({
      archivePath: wrapper ? `${wrapper}/${relativeTarget}` : relativeTarget,
      relativeTarget,
    }));
    return {
      ok: true,
      plan: {
        kind: "workshop",
        displayName: info.modName,
        packageName: info.packageName,
        workshopFolderName: sanitizeFolderName(info.packageName),
        files,
      },
    };
  }

  let wrapper: string | null = null;
  let relativePaths = normalized;
  if (!normalized.some(isPathRooted)) {
    wrapper = commonSingleWrapper(normalized);
    if (wrapper) {
      const stripped = normalized.map((p) => stripPrefix(p, wrapper as string));
      if (stripped.some(isPathRooted)) {
        relativePaths = stripped;
      } else {
        wrapper = null;
      }
    }
  }

  if (!relativePaths.some(isPathRooted)) {
    return {
      ok: false,
      error:
        "Could not recognize mod install layout (need Info.json or Pal/ / Mods/ paths)",
    };
  }

  const files: ResolvedZipFile[] = relativePaths
    .filter(isPathRooted)
    .map((relativeTarget) => ({
      archivePath: wrapper ? `${wrapper}/${relativeTarget}` : relativeTarget,
      relativeTarget,
    }));

  if (files.length === 0) {
    return {
      ok: false,
      error:
        "Could not recognize mod install layout (need Info.json or Pal/ / Mods/ paths)",
    };
  }

  const leaf = files[0]?.relativeTarget.split("/").pop() ?? "ImportedMod";
  const displayName = leaf.replace(/\.[^.]+$/, "") || "ImportedMod";

  return {
    ok: true,
    plan: {
      kind: "path_deploy",
      displayName,
      packageName: null,
      workshopFolderName: null,
      files,
    },
  };
}
