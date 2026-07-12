import { useState, useEffect } from "react";
import "./ConfigEditor.css";

import type { ConfigFormat } from "../types/ipc";

interface ConfigEditorProps {
  appId: number;
  serverName: string;
  installPath: string;
  onClose: () => void;
  onSave: () => void;
}

function coerceEditedValue(
  original: unknown,
  inputValue: string,
  checked?: boolean
): unknown {
  if (typeof original === "boolean") {
    return Boolean(checked);
  }
  if (typeof original === "number") {
    if (inputValue === "") {
      return 0;
    }
    const parsed = Number(inputValue);
    return Number.isNaN(parsed) ? original : parsed;
  }
  return inputValue;
}

export function ConfigEditor({
  appId,
  serverName,
  installPath,
  onClose,
  onSave,
}: ConfigEditorProps): JSX.Element {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [format, setFormat] = useState<ConfigFormat | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [addFields, setAddFields] = useState<
    Record<string, { key: string; value: string } | undefined>
  >({});

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        const result = await window.electron.getServerConfig(
          appId,
          installPath
        );

        if (!result.success) {
          setError(result.error ?? "Failed to load config");
          return;
        }

        setConfig(result.content ?? {});
        setFormat(result.format ?? "json");
        if (typeof result.filePath === "string") {
          setFilePath(result.filePath);
        } else {
          setFilePath(null);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to load config";
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    })();
  }, [appId, installPath]);

  const deepClone = (obj: unknown): unknown => {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return obj;
    }
  };

  const navigateToParent = (
    root: Record<string, unknown>,
    pathArr: string[]
  ): Record<string, unknown> | null => {
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < pathArr.length - 1; i++) {
      const p = pathArr[i];
      const next = cur[p];
      if (typeof next !== "object" || next === null) {
        return null;
      }
      cur = next as Record<string, unknown>;
    }
    return cur;
  };

  const updateConfigAtPath = (pathArr: string[], value: unknown): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const next = deepClone(prev) as Record<string, unknown>;
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < pathArr.length - 1; i++) {
        const p = pathArr[i];
        if (typeof cur[p] !== "object" || cur[p] === null) {
          cur[p] = {};
        }
        cur = cur[p] as Record<string, unknown>;
      }
      cur[pathArr[pathArr.length - 1]] = value;
      return next;
    });
  };

  const deleteConfigAtPath = (pathArr: string[]): void => {
    setConfig((prev) => {
      if (!prev || pathArr.length === 0) {
        return prev;
      }
      const next = deepClone(prev) as Record<string, unknown>;
      const parent = navigateToParent(next, pathArr);
      if (!parent) {
        return next;
      }
      const lastKey = pathArr[pathArr.length - 1];
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete parent[lastKey];
      return next;
    });
  };

  const handleDeleteProperty = (
    pathArr: string[],
    key: string,
    isTopLevel: boolean
  ): void => {
    if (isTopLevel) {
      if (!window.confirm(`Delete property "${key}"?`)) {
        return;
      }
    }
    deleteConfigAtPath(pathArr);
  };

  const updateArrayAtPath = (
    pathArr: string[],
    index: number,
    value: unknown
  ): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const next = deepClone(prev) as Record<string, unknown>;
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < pathArr.length; i++) {
        const p = pathArr[i];
        if (i === pathArr.length - 1) {
          const arr = cur[p] as unknown[] | undefined;
          if (!Array.isArray(arr)) {
            return next;
          }
          arr[index] = value;
          cur[p] = arr;
          return next;
        }
        if (typeof cur[p] !== "object" || cur[p] === null) {
          cur[p] = {};
        }
        cur = cur[p] as Record<string, unknown>;
      }
      return next;
    });
  };

  const addArrayElement = (pathArr: string[]): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const next = deepClone(prev) as Record<string, unknown>;
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < pathArr.length; i++) {
        const p = pathArr[i];
        if (i === pathArr.length - 1) {
          const existing = cur[p];
          const arr = Array.isArray(existing) ? (existing as unknown[]) : [];
          if (!Array.isArray(existing)) {
            cur[p] = [""];
          } else {
            arr.push("");
            cur[p] = arr;
          }
          return next;
        }
        if (typeof cur[p] !== "object" || cur[p] === null) {
          cur[p] = {};
        }
        cur = cur[p] as Record<string, unknown>;
      }
      return next;
    });
  };

  const addArrayElementWithTemplate = (
    pathArr: string[],
    template?: unknown
  ): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const next = deepClone(prev) as Record<string, unknown>;
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < pathArr.length; i++) {
        const p = pathArr[i];
        if (i === pathArr.length - 1) {
          const existing = cur[p];
          const arr = Array.isArray(existing) ? (existing as unknown[]) : [];
          if (!Array.isArray(existing)) {
            cur[p] = template !== undefined ? [deepClone(template)] : [""];
          } else {
            arr.push(template !== undefined ? deepClone(template) : "");
            cur[p] = arr;
          }
          return next;
        }
        if (typeof cur[p] !== "object" || cur[p] === null) {
          cur[p] = {};
        }
        cur = cur[p] as Record<string, unknown>;
      }
      return next;
    });
  };

  const toggleExpanded = (pathStr: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) {
        next.delete(pathStr);
      } else {
        next.add(pathStr);
      }
      return next;
    });
  };

  const showAddField = (pathStr: string): void => {
    setAddFields((prev) => ({ ...prev, [pathStr]: { key: "", value: "" } }));
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.add(pathStr);
      return next;
    });
  };

  const hideAddField = (pathStr: string): void => {
    setAddFields((prev) => {
      const next = { ...prev };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete next[pathStr as keyof typeof next];
      return next;
    });
  };

  const updateAddField = (
    pathStr: string,
    keyOrVal: "key" | "value",
    val: string
  ): void => {
    setAddFields((prev) => {
      const existing = prev[pathStr];
      const base = existing ?? { key: "", value: "" };
      return { ...prev, [pathStr]: { ...base, [keyOrVal]: val } };
    });
  };

  const handleAddField = (pathArr: string[], pathStr: string): void => {
    const field = addFields[pathStr];
    if (!field || field.key.trim().length === 0) {
      setError("Property name is required");
      return;
    }

    const targetPath = [...pathArr, field.key.trim()];
    updateConfigAtPath(targetPath, field.value);
    hideAddField(pathStr);
  };

  const renderLeafControl = (
    label: string,
    value: unknown,
    onChange: (next: unknown) => void
  ): JSX.Element => {
    if (typeof value === "boolean") {
      return (
        <input
          type="checkbox"
          checked={value}
          onChange={(e) =>
            onChange(coerceEditedValue(value, "", e.target.checked))
          }
          aria-label={label}
          className="property-value-input property-value-checkbox"
        />
      );
    }

    if (typeof value === "number") {
      return (
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(coerceEditedValue(value, e.target.value))}
          aria-label={label}
          className="property-value-input"
          style={{ maxWidth: 420 }}
        />
      );
    }

    return (
      <input
        type="text"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(coerceEditedValue(value, e.target.value))}
        aria-label={label}
        className="property-value-input"
        style={{ maxWidth: 420 }}
      />
    );
  };

  const renderDeleteButton = (
    pathArr: string[],
    key: string,
    isTopLevel: boolean
  ): JSX.Element => (
    <button
      type="button"
      className="btn btn-remove btn-small"
      onClick={(e) => {
        e.stopPropagation();
        handleDeleteProperty(pathArr, key, isTopLevel);
      }}
      aria-label={`Delete ${key}`}
      title={`Delete ${key}`}
    >
      ✕
    </button>
  );

  const renderProperty = (
    key: string,
    value: unknown,
    pathArr: string[],
    depth = 0
  ): JSX.Element => {
    const fullPath = [...pathArr, key];
    const pathStr = fullPath.join(".");
    const isTopLevel = pathArr.length === 0;

    if (value !== null && value !== undefined && typeof value === "object") {
      if (Array.isArray(value)) {
        const arr = value as unknown[];
        const isExpanded = expandedPaths.has(pathStr);

        return (
          <div
            key={pathStr}
            className="property-group"
            style={{ paddingLeft: depth * 18 }}
          >
            <div
              className={`property-group-title ${isExpanded ? "expanded" : "collapsed"}`}
              onClick={() => toggleExpanded(pathStr)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  toggleExpanded(pathStr);
                }
              }}
            >
              <span className={`caret ${isExpanded ? "rotated" : ""}`} />
              <div className="property-name">
                {key} [Array({arr.length})]
              </div>
              <button
                type="button"
                className="btn btn-plus"
                onClick={(e) => {
                  e.stopPropagation();
                  const last = arr.length > 0 ? arr[arr.length - 1] : undefined;
                  if (
                    last !== undefined &&
                    last !== null &&
                    typeof last === "object"
                  ) {
                    addArrayElementWithTemplate(fullPath, last);
                  } else {
                    addArrayElement(fullPath);
                  }
                }}
                title="Add item to array"
              >
                +
              </button>
              {renderDeleteButton(fullPath, key, isTopLevel)}
            </div>

            <div
              className={`properties-list nested ${isExpanded ? "open" : "closed"}`}
            >
              {arr.map((item, idx) => {
                const itemKey = String(idx);
                if (
                  item !== null &&
                  typeof item === "object" &&
                  !Array.isArray(item)
                ) {
                  const itemPath = [...fullPath, itemKey];
                  const itemPathStr = itemPath.join(".");
                  const itemExpanded = expandedPaths.has(itemPathStr);

                  return (
                    <div
                      key={itemPathStr}
                      className="property-group"
                      style={{ paddingLeft: (depth + 1) * 18 }}
                    >
                      <div
                        className={`property-group-title ${itemExpanded ? "expanded" : "collapsed"}`}
                        onClick={() => toggleExpanded(itemPathStr)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            toggleExpanded(itemPathStr);
                          }
                        }}
                      >
                        <span
                          className={`caret ${itemExpanded ? "rotated" : ""}`}
                        />
                        <div className="property-name">[{idx}]</div>
                        <button
                          type="button"
                          className="btn btn-plus"
                          onClick={(e) => {
                            e.stopPropagation();
                            showAddField(itemPathStr);
                          }}
                          title="Add property"
                        >
                          +
                        </button>
                      </div>

                      <div
                        className={`properties-list nested ${itemExpanded ? "open" : "closed"}`}
                      >
                        {Object.entries(item as Record<string, unknown>).map(
                          ([k, v]) => renderProperty(k, v, itemPath, depth + 2)
                        )}
                      </div>

                      <div className="group-end-divider" />
                    </div>
                  );
                }

                // Index keys are intentional (007.1): primitives lack stable ids;
                // pathStr + idx avoids remount flicker from Date.now()/Math.random().
                return (
                  <div
                    // eslint-disable-next-line react/no-array-index-key -- 007.1 stable index keys
                    key={`${pathStr}.${idx}`}
                    className="property-item two-column"
                    style={{ paddingLeft: (depth + 1) * 18 }}
                  >
                    <div className="property-name">[{idx}]</div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                      }}
                    >
                      {renderLeafControl(String(item), item, (next) =>
                        updateArrayAtPath(fullPath, idx, next)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="group-end-divider" />
          </div>
        );
      }

      const obj = value as Record<string, unknown>;
      const isExpanded = expandedPaths.has(pathStr);

      return (
        <div
          key={pathStr}
          className="property-group"
          style={{ paddingLeft: depth * 18 }}
        >
          <div
            className={`property-group-title ${isExpanded ? "expanded" : "collapsed"}`}
            onClick={() => toggleExpanded(pathStr)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                toggleExpanded(pathStr);
              }
            }}
          >
            <span className={`caret ${isExpanded ? "rotated" : ""}`} />
            <div className="property-name">{key}</div>
            <button
              type="button"
              className="btn btn-plus"
              onClick={(e) => {
                e.stopPropagation();
                showAddField(pathStr);
              }}
              title="Add property"
            >
              +
            </button>
            {renderDeleteButton(fullPath, key, isTopLevel)}
          </div>

          <div
            className={`properties-list nested ${isExpanded ? "open" : "closed"}`}
          >
            {Object.entries(obj).map(([k, v]) =>
              renderProperty(k, v, fullPath, depth + 1)
            )}

            {addFields[pathStr] !== undefined ? (
              <div
                className="add-inline-form"
                style={{ paddingLeft: (depth + 1) * 18 }}
              >
                <input
                  type="text"
                  placeholder="Property name"
                  value={addFields[pathStr].key}
                  onChange={(e) =>
                    updateAddField(pathStr, "key", e.target.value)
                  }
                  className="property-key-input"
                />
                <input
                  type="text"
                  placeholder="Property value"
                  value={addFields[pathStr].value}
                  onChange={(e) =>
                    updateAddField(pathStr, "value", e.target.value)
                  }
                  className="property-value-input"
                />
                <button
                  type="button"
                  className="btn btn-small btn-save-inline"
                  onClick={() => handleAddField(fullPath, pathStr)}
                  title="Save"
                >
                  💾
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-cancel-inline"
                  onClick={() => hideAddField(pathStr)}
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            ) : null}
          </div>

          <div className="group-end-divider" />
        </div>
      );
    }

    return (
      <div
        key={pathStr}
        className="property-item two-column"
        style={{ paddingLeft: depth * 14 }}
      >
        <div className="property-name">{key}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {renderLeafControl(key, value, (next) =>
            updateConfigAtPath(fullPath, next)
          )}
          {renderDeleteButton(fullPath, key, isTopLevel)}
        </div>
      </div>
    );
  };

  const handleSave = (): void => {
    if (!config || !format) {
      setError("Config not loaded");
      return;
    }

    void (async (): Promise<void> => {
      try {
        setSaving(true);
        setError(null);

        const result = await window.electron.saveServerConfig(
          appId,
          installPath,
          config,
          format
        );

        if (!result.success) {
          setError(result.error ?? "Failed to save config");
          return;
        }

        // eslint-disable-next-line no-console
        console.log("Config saved successfully");
        onSave();
        onClose();
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to save config";
        setError(errorMsg);
      } finally {
        setSaving(false);
      }
    })();
  };

  const topAdd = addFields[""];

  if (loading) {
    return (
      <div className="config-editor-overlay">
        <div className="config-editor-modal">
          <div className="config-editor-header">
            <h2>Edit Configuration</h2>
            <button type="button" className="close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="config-editor-content">
            <p>Loading configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="config-editor-overlay">
      <div className="config-editor-modal">
        <div className="config-editor-header">
          <div>
            <h2>Edit Configuration</h2>
            <p className="config-editor-subtitle">{serverName}</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {error !== null && (
          <div className="config-editor-error">
            <p>⚠️ {error}</p>
          </div>
        )}

        <div className="config-editor-content">
          {config && Object.keys(config).length > 0 ? (
            <div className="properties-section">
              <div className="properties-header">
                <h3>Current Properties</h3>
                <button
                  type="button"
                  className="btn btn-plus"
                  onClick={() => showAddField("")}
                  title="Add top-level property"
                >
                  +
                </button>
              </div>
              <div className="properties-list">
                {Object.entries(config).map(([key, value]) =>
                  renderProperty(key, value, [])
                )}
                {topAdd ? (
                  <div className="add-inline-form" style={{ paddingLeft: 0 }}>
                    <input
                      type="text"
                      placeholder="Property name"
                      value={topAdd.key}
                      onChange={(e) =>
                        updateAddField("", "key", e.target.value)
                      }
                      className="property-key-input"
                    />
                    <input
                      type="text"
                      placeholder="Property value"
                      value={topAdd.value}
                      onChange={(e) =>
                        updateAddField("", "value", e.target.value)
                      }
                      className="property-value-input"
                    />
                    <button
                      type="button"
                      className="btn btn-small btn-save-inline"
                      onClick={() => handleAddField([], "")}
                      title="Save"
                    >
                      💾
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-cancel-inline"
                      onClick={() => hideAddField("")}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="empty-config">No properties found</p>
          )}
        </div>

        <div className="config-editor-footer">
          <button type="button" className="btn btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-open"
            onClick={() => {
              if (filePath === null || filePath === "") {
                return;
              }
              void window.electron.openFileDefault(filePath).then((res) => {
                if (!res.success) {
                  console.error("Failed to open file:", res.error);
                }
              });
            }}
            disabled={filePath === null || filePath === ""}
          >
            Open
          </button>

          <button
            type="button"
            className="btn btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
