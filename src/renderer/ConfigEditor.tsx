import { useState, useEffect } from "react";
import "./ConfigEditor.css";

export interface ConfigEditorProps {
  appId: number;
  serverName: string;
  installPath: string;
  onClose: () => void;
  onSave: () => void;
}

export function ConfigEditor({
  appId,
  serverName,
  installPath,
  onClose,
  onSave,
}: ConfigEditorProps): JSX.Element {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [format, setFormat] = useState<"json" | "ini" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // per-parent add fields are stored in `addFields`
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [addFields, setAddFields] = useState<Record<string, { key: string; value: string } | undefined>>({});

  // Load config on mount
  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const result = (await window.electron.ipcRenderer.invoke(
          "get-server-config",
          appId,
          installPath
        )) as {
          success: boolean;
          content?: Record<string, unknown>;
          format?: "json" | "ini";
          error?: string;
        };

        if (!result.success) {
          setError(result.error ?? "Failed to load config");
          return;
        }

        setConfig(result.content ?? {});
        setFormat(result.format ?? "json");
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to load config";
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    })();
  }, [appId, installPath]);

  // global add helper removed; use per-parent inline add fields instead

  // removed unused: handleRemoveProperty, handlePropertyChange

  // Helpers for nested properties
  const deepClone = (obj: unknown): unknown => {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return obj;
    }
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

  const updateArrayAtPath = (pathArr: string[], index: number, value: unknown): void => {
    setConfig((prev) => {
      if (!prev) {
        return prev;
      }
      const next = deepClone(prev) as Record<string, unknown>;
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < pathArr.length; i++) {
        const p = pathArr[i];
        if (i === pathArr.length - 1) {
          // last segment should be array
          const arr = cur[p] as unknown[] | undefined;
          if (!Array.isArray(arr)) {
            return next;
          }
          arr[index] = value;
          cur[p] = arr;
          return next;
        }
        if (typeof cur[p] !== 'object' || cur[p] === null) {
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
            // default push empty string
            arr.push("");
            cur[p] = arr;
          }
          return next;
        }
        if (typeof cur[p] !== 'object' || cur[p] === null) {
          cur[p] = {};
        }
        cur = cur[p] as Record<string, unknown>;
      }
      return next;
    });
  };

  // Add array element with optional template (duplicate existing element structure)
  const addArrayElementWithTemplate = (pathArr: string[], template?: unknown): void => {
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
        if (typeof cur[p] !== 'object' || cur[p] === null) {
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

  const updateAddField = (pathStr: string, keyOrVal: 'key' | 'value', val: string): void => {
    setAddFields((prev) => {
      const existing = prev[pathStr];
      const base = existing ?? { key: '', value: '' };
      return { ...prev, [pathStr]: { ...base, [keyOrVal]: val } };
    });
  };

  const handleAddField = (pathArr: string[], pathStr: string): void => {
    const field = addFields[pathStr];
    if (!field || field.key.trim().length === 0) {
      setError('Property name is required');
      return;
    }

    // Insert new property under parent path
    const targetPath = [...pathArr, field.key.trim()];
    updateConfigAtPath(targetPath, field.value);
    hideAddField(pathStr);
  };

  const renderProperty = (
    key: string,
    value: unknown,
    pathArr: string[],
    depth = 0
  ): JSX.Element => {
    const fullPath = [...pathArr, key];
    const pathStr = fullPath.join('.');

    if (value !== null && value !== undefined && typeof value === 'object') {
      // Arrays: render each item (break down objects inside arrays)
      if (Array.isArray(value)) {
        const arr = value as unknown[];
        const isExpanded = expandedPaths.has(pathStr);

        return (
          <div key={pathStr} className="property-group" style={{ paddingLeft: depth * 18 }}>
            <div
              className={`property-group-title ${isExpanded ? 'expanded' : 'collapsed'}`}
              onClick={() => toggleExpanded(pathStr)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  toggleExpanded(pathStr);
                }
              }}
            >
              <span className={`caret ${isExpanded ? 'rotated' : ''}`} />
                <div className="property-name">{key} [Array({arr.length})]</div>
                <button
                  className="btn btn-plus"
                  onClick={(e) => {
                    e.stopPropagation();
                    // If array has object items, duplicate the last object's structure, else add blank
                    const last = arr.length > 0 ? arr[arr.length - 1] : undefined;
                    if (last !== undefined && last !== null && typeof last === 'object') {
                      addArrayElementWithTemplate(fullPath, last);
                    } else {
                      addArrayElement(fullPath);
                    }
                  }}
                  title="Add item to array"
                >
                  +
                </button>
            </div>

              <div className={`properties-list nested ${isExpanded ? 'open' : 'closed'}`}>
              {arr.map((item, idx) => {
                const itemKey = String(idx);
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                  // Render object item as its own collapsible group with index label
                  const itemPath = [...fullPath, itemKey];
                  const itemPathStr = itemPath.join('.');
                  const itemExpanded = expandedPaths.has(itemPathStr);

                  return (
                    <div key={itemPathStr} className="property-group" style={{ paddingLeft: (depth + 1) * 18 }}>
                      <div
                        className={`property-group-title ${itemExpanded ? 'expanded' : 'collapsed'}`}
                        onClick={() => toggleExpanded(itemPathStr)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            toggleExpanded(itemPathStr);
                          }
                        }}
                      >
                        <span className={`caret ${itemExpanded ? 'rotated' : ''}`} />
                        <div className="property-name">[{idx}]</div>
                          <button
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

                      <div className={`properties-list nested ${itemExpanded ? 'open' : 'closed'}`}>
                        {Object.entries(item as Record<string, unknown>).map(([k, v]) => renderProperty(k, v, itemPath, depth + 2))}
                      </div>

                      <div className="group-end-divider" />
                    </div>
                  );
                }

                return (
                  <div key={`${pathStr}.${Date.now()}.${Math.random().toString(36).slice(2,9)}`} className="property-item two-column" style={{ paddingLeft: (depth + 1) * 18 }}>
                    <div className="property-name">[{idx}]</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <input
                        type="text"
                        value={item === undefined || item === null ? '' : String(item)}
                        onChange={(e) => updateArrayAtPath(fullPath, idx, e.target.value)}
                        className="property-value-input"
                        style={{ maxWidth: 420 }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* array-controls removed - use header + to add items */}
            </div>

            <div className="group-end-divider" />
          </div>
        );
      }

      // Plain object
      const obj = value as Record<string, unknown>;
      const isExpanded = expandedPaths.has(pathStr);

      return (
        <div key={pathStr} className="property-group" style={{ paddingLeft: depth * 18 }}>
          <div
            className={`property-group-title ${isExpanded ? 'expanded' : 'collapsed'}`}
            onClick={() => toggleExpanded(pathStr)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleExpanded(pathStr);
              }
            }}
          >
            <span className={`caret ${isExpanded ? 'rotated' : ''}`} />
            <div className="property-name">{key}</div>
            <button
              className="btn btn-plus"
              onClick={(e) => {
                e.stopPropagation();
                showAddField(pathStr);
              }}
              title="Add property"
            >
              +
            </button>
          </div>

          <div className={`properties-list nested ${isExpanded ? 'open' : 'closed'}`}>
            {Object.entries(obj).map(([k, v]) => renderProperty(k, v, fullPath, depth + 1))}

            {addFields[pathStr] !== undefined ? (
              <div className="add-inline-form" style={{ paddingLeft: (depth + 1) * 18 }}>
                <input
                  type="text"
                  placeholder="Property name"
                  value={addFields[pathStr].key}
                  onChange={(e) => updateAddField(pathStr, 'key', e.target.value)}
                  className="property-key-input"
                />
                <input
                  type="text"
                  placeholder="Property value"
                  value={addFields[pathStr].value}
                  onChange={(e) => updateAddField(pathStr, 'value', e.target.value)}
                  className="property-value-input"
                />
                <button className="btn btn-small btn-save-inline" onClick={() => handleAddField(fullPath, pathStr)} title="Save">
                  💾
                </button>
                <button className="btn btn-small btn-cancel-inline" onClick={() => hideAddField(pathStr)} title="Cancel">✕</button>
              </div>
            ) : null}
          </div>

          <div className="group-end-divider" />
        </div>
      );
    }

      return (
        <div key={pathStr} className="property-item two-column" style={{ paddingLeft: depth * 14 }}>
          <div className="property-name">{key}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <input
              type="text"
              value={value === undefined || value === null ? '' : String(value)}
              onChange={(e) => updateConfigAtPath(fullPath, e.target.value)}
              className="property-value-input"
              style={{ maxWidth: 420 }}
            />
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const result = (await window.electron.ipcRenderer.invoke(
          "save-server-config",
          appId,
          installPath,
          config,
          format
        )) as { success: boolean; error?: string };

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

  const topAdd = addFields[''];

  if (loading) {
    return (
      <div className="config-editor-overlay">
        <div className="config-editor-modal">
          <div className="config-editor-header">
            <h2>Edit Configuration</h2>
            <button className="close-btn" onClick={onClose}>
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
          <button className="close-btn" onClick={onClose}>
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
                    className="btn btn-plus"
                    onClick={() => showAddField('')}
                    title="Add top-level property"
                  >
                    +
                  </button>
                </div>
                <div className="properties-list">
                {Object.entries(config).map(([key, value]) => renderProperty(key, value, []))}
                {topAdd ? (
                  <div className="add-inline-form" style={{ paddingLeft: 0 }}>
                    <input
                      type="text"
                      placeholder="Property name"
                      value={topAdd.key}
                      onChange={(e) => updateAddField('', 'key', e.target.value)}
                      className="property-key-input"
                    />
                    <input
                      type="text"
                      placeholder="Property value"
                      value={topAdd.value}
                      onChange={(e) => updateAddField('', 'value', e.target.value)}
                      className="property-value-input"
                    />
                    <button className="btn btn-small btn-save-inline" onClick={() => handleAddField([], '')} title="Save">💾</button>
                    <button className="btn btn-small btn-cancel-inline" onClick={() => hideAddField('')} title="Cancel">✕</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="empty-config">No properties found</p>
          )}

          {/* Inline per-parent add controls shown next to each group title */}
        </div>

        <div className="config-editor-footer">
          <button className="btn btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
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
