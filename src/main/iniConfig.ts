export function parseIniContent(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection = "";

  function splitRespectingQuotes(s: string, delim = ","): string[] {
    const parts: string[] = [];
    let cur = "";
    let inQuote = false;
    let parenDepth = 0;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') {
        inQuote = !inQuote;
        cur += ch;
        continue;
      }

      if (!inQuote) {
        if (ch === "(") {
          parenDepth += 1;
          cur += ch;
          continue;
        }
        if (ch === ")") {
          if (parenDepth > 0) {
            parenDepth -= 1;
          }
          cur += ch;
          continue;
        }
      }

      if (ch === delim && !inQuote) {
        // only split on delimiter when not inside quotes or nested parentheses
        if (parenDepth === 0) {
          parts.push(cur.trim());
          cur = "";
          continue;
        }
        // otherwise treat as literal delimiter inside nested structure
        cur += ch;
      } else {
        cur += ch;
      }
    }

    if (cur.trim() !== "") {
      parts.push(cur.trim());
    }
    return parts;
  }

  function parseTokenValue(token: string): unknown {
    const t = token.trim();
    if (t === "") {
      return "";
    }
    if (t.startsWith('"') && t.endsWith('"')) {
      return t.slice(1, -1);
    }
    if (/^[-+]?\d+\.?\d*$/.test(t)) {
      return Number(t);
    }
    if (/^(true|false)$/i.test(t)) {
      return t.toLowerCase() === "true";
    }
    return t;
  }

  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      result[currentSection] = {};
      continue;
    }

    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    // Handle parenthesized values: either arrays like (a,b,c) or key=value pairs (k=v,...)
    if (value.startsWith("(") && value.endsWith(")")) {
      const inner = value.slice(1, -1).trim();
      // if inner contains '=' then it's a map-like structure
      if (inner.includes("=")) {
        const obj: Record<string, unknown> = {};
        const pairs = splitRespectingQuotes(inner, ",");
        for (const p of pairs) {
          const eq = p.indexOf("=");
          if (eq === -1) {
            continue;
          }
          const sk = p.slice(0, eq).trim();
          const svRaw = p.slice(eq + 1).trim();
          // Preserve child property values exactly as strings (do not convert numbers/booleans)
          // and keep any surrounding quotes the user added.
          obj[sk] = svRaw;
        }
        if (currentSection) {
          const sec = result[currentSection] as Record<string, unknown>;
          sec[key] = obj;
        } else {
          result[key] = obj;
        }
        continue;
      }

      // Otherwise treat as simple array
      const items = splitRespectingQuotes(inner, ",").map((it) =>
        parseTokenValue(it)
      );
      if (currentSection) {
        const sec = result[currentSection] as Record<string, unknown>;
        sec[key] = items;
      } else {
        result[key] = items;
      }
      continue;
    }

    // plain primitive value
    const parsed = parseTokenValue(value);
    if (currentSection) {
      const sec = result[currentSection] as Record<string, unknown>;
      sec[key] = parsed;
    } else {
      result[key] = parsed;
    }
  }

  return result;
}

export function stringifyIniContent(content: Record<string, unknown>): string {
  const escapeIfNeeded = (s: string) => {
    if (s === "") {
      return '""';
    }
    if (s.includes(" ") || s.includes(",") || s.includes('"')) {
      return `"${s.replace(/"/g, '\\"')}"`;
    }
    return s;
  };

  let out = "";
  for (const [k, v] of Object.entries(content)) {
    // sections (objects) produce [section] blocks
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out += `[${k}]\n`;
      const section = v as Record<string, unknown>;
      for (const [sk, sv] of Object.entries(section)) {
        // If the section value is an object or array, serialize as parenthesized tuple or key=value list
        if (Array.isArray(sv)) {
          const items = sv.map((it) => {
            if (typeof it === "string") {
              return escapeIfNeeded(it);
            }
            return String(it);
          });
          out += `${sk}=(${items.join(",")})\n`;
        } else if (typeof sv === "object" && sv !== null) {
          const pairs: string[] = [];
          for (const [k2, v2] of Object.entries(
            sv as Record<string, unknown>
          )) {
            let valStr: string;
            if (typeof v2 === "string") {
              // Preserve child string values exactly as provided (do not auto-quote).
              valStr = v2;
            } else {
              valStr = String(v2);
            }
            pairs.push(`${k2}=${valStr}`);
          }
          out += `${sk}=(${pairs.join(",")})\n`;
        } else {
          out += `${sk}=${String(sv)}\n`;
        }
      }
      out += "\n";
    } else {
      // top-level primitive or array
      if (Array.isArray(v)) {
        const items = v.map((it) =>
          typeof it === "string" ? escapeIfNeeded(it) : String(it)
        );
        out += `${k}=(${items.join(",")})\n`;
      } else {
        out += `${k}=${String(v)}\n`;
      }
    }
  }
  return out;
}
