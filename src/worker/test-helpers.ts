/**
 * Mock D1 Database for testing.
 *
 * Mimics real D1 semantics closely enough for Drizzle:
 * - `raw()` returns arrays of column values (in the order of the SELECT
 *   column list parsed from the SQL), which is what drizzle-orm's D1 driver
 *   expects when mapping result rows.
 * - `WHERE` clauses are actually evaluated against bound values.
 * - INSERT column lists are parsed (quotes stripped) and bound values are
 *   aligned positionally; missing columns fall back to schema defaults.
 */

type Row = Record<string, any>;

// Minimal schema defaults so inserts that omit columns behave like real D1.
const TABLE_DEFAULTS: Record<string, Row> = {
  user_facts: { category: 'other', source: 'explicit' },
  conversation_summaries: { message_count: 0 },
  conversations: { messages_json: '[]', model: 'gpt-4o', pinned: 0 },
  mcp_servers: {
    enabled: 1,
    tools_json: '[]',
    status: 'disconnected',
    oauth_enabled: 0,
  },
  api_endpoints: { enabled: 1, is_default: 0 },
  oauth_states: {},
  settings: {
    endpoints_json: '[]',
    memory_enabled: 1,
    auto_memory: 1,
    theme: 'system',
  },
  sessions: {},
  memory_extraction_log: { facts_extracted: 0 },
};

function normalizeValue(v: any): any {
  if (v instanceof Date) return v.getTime();
  return v;
}

function looseEqual(a: any, b: any): boolean {
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  if (na === nb) return true;
  if (na == null || nb == null) return na === nb;
  if (typeof na === 'number' || typeof nb === 'number') {
    const x = Number(na);
    const y = Number(nb);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y;
  }
  return String(na) === String(nb);
}

function stripIdent(ident: string): string {
  // "table"."column" | "column" | table.column -> column
  const parts = ident.split('.');
  return parts[parts.length - 1].replace(/"/g, '').trim();
}

/** Parse the WHERE clause and return a row predicate. Bind values are consumed in order. */
function buildWherePredicate(whereSql: string, bindValues: any[]): (row: Row) => boolean {
  if (!whereSql || !whereSql.trim()) return () => true;

  // Split top-level conditions on AND/OR (no subquery/paren support needed here).
  const tokens = whereSql.split(/\s+(and|or)\s+/i);
  const conditions: { sql: string; op: 'and' | 'or' }[] = [];
  conditions.push({ sql: tokens[0], op: 'and' });
  for (let i = 1; i < tokens.length; i += 2) {
    conditions.push({ sql: tokens[i + 1], op: (tokens[i].toLowerCase() as 'and' | 'or') });
  }

  let bindIndex = 0;
  const evaluated = conditions.map(({ sql, op }) => {
    const m = sql.match(
      /^\s*("?[\w.]+"?)\s*(=|!=|<>|>=|<=|>|<)\s*(\?|('[^']*'|\d+(?:\.\d+)?))\s*$/i
    );
    if (!m) return { op, result: true }; // Unknown condition shape: don't filter it out.
    const column = stripIdent(m[1]);
    const comparator = m[2].toUpperCase();
    let expected: any;
    if (m[3] === '?') {
      expected = normalizeValue(bindValues[bindIndex++]);
    } else if (m[3].startsWith("'")) {
      expected = m[3].slice(1, -1);
    } else {
      expected = Number(m[3]);
    }
    return {
      op,
      result: false,
      evaluate: (row: Row) => {
        const actual = normalizeValue(row[column]);
        switch (comparator) {
          case '=': return looseEqual(actual, expected);
          case '!=':
          case '<>': return !looseEqual(actual, expected);
          case '>': return Number(actual) > Number(expected);
          case '<': return Number(actual) < Number(expected);
          case '>=': return Number(actual) >= Number(expected);
          case '<=': return Number(actual) <= Number(expected);
          default: return false;
        }
      },
    };
  });

  return (row: Row) => {
    let acc = evaluated[0].evaluate ? evaluated[0].evaluate(row) : evaluated[0].result;
    for (let i = 1; i < evaluated.length; i++) {
      const condition = evaluated[i];
      const next = condition.evaluate ? condition.evaluate(row) : condition.result;
      acc = evaluated[i].op === 'or' ? (acc || next) : (acc && next);
    }
    return acc;
  };
}

function splitWhere(sql: string): { base: string; where: string } {
  const m = sql.match(/\bwhere\b([\s\S]*)$/i);
  if (!m) return { base: sql, where: '' };
  return { base: sql.slice(0, m.index), where: m[1] };
}

function parseSelectedColumns(sql: string): string[] | null {
  const m = sql.match(/^select\s+([\s\S]*?)\s+from\s/i);
  if (!m) return null;
  const list = m[1].trim();
  if (list === '*') return null;
  return list.split(',').map((c) => stripIdent(c.trim()));
}

function extractTableName(sql: string): string | null {
  return (
    sql.match(/insert\s+into\s+"?(\w+)"?/i)?.[1] ||
    sql.match(/update\s+"?(\w+)"?/i)?.[1] ||
    sql.match(/delete\s+from\s+"?(\w+)"?/i)?.[1] ||
    sql.match(/from\s+"?(\w+)"?/i)?.[1] ||
    null
  );
}

export function createMockDB() {
  const data: Record<string, Row[]> = {
    user_facts: [],
    conversation_summaries: [],
    conversations: [],
    mcp_servers: [],
    api_endpoints: [],
    oauth_states: [],
    settings: [],
    sessions: [],
    memory_extraction_log: [],
  };

  function handleInsert(sql: string, bindValues: any[], tableName: string) {
    const columnsMatch = sql.match(/\(([^)]+)\)/);
    const defaults = TABLE_DEFAULTS[tableName] || {};
    if (!columnsMatch) {
      // INSERT without column list: values map positionally to defaults order —
      // not something our queries produce; store nothing meaningful.
      data[tableName].push({ ...bindValues });
      return;
    }
    const columns = columnsMatch[1].split(',').map((c) => stripIdent(c.trim()));
    const newRow: Row = { ...defaults };
    columns.forEach((col, i) => {
      newRow[col] = normalizeValue(bindValues[i]);
    });
    data[tableName].push(newRow);
  }

  function handleUpdate(sql: string, bindValues: any[], tableName: string) {
    const { base, where } = splitWhere(sql);
    const setClause = base.match(/set\s+([\s\S]*)$/i)?.[1] || '';
    // Count placeholders in the SET clause to know how many bind values belong to it.
    const setPlaceholderCount = (setClause.match(/\?/g) || []).length;
    const setValues = bindValues.slice(0, setPlaceholderCount);
    const whereValues = bindValues.slice(setPlaceholderCount);

    const updates: Row = {};
    // Extract column names from `SET "col" = ?, ...`
    const assignments = setClause.split(',').map((s) => s.trim()).filter(Boolean);
    assignments.forEach((assignment, i) => {
      const col = stripIdent(assignment.split('=')[0].trim());
      updates[col] = normalizeValue(setValues[i]);
    });

    const predicate = buildWherePredicate(where, whereValues);
    data[tableName].forEach((row, i) => {
      if (predicate(row)) {
        data[tableName][i] = { ...row, ...updates };
      }
    });
  }

  function handleDelete(sql: string, bindValues: any[], tableName: string) {
    const { where } = splitWhere(sql);
    if (!where.trim()) {
      data[tableName] = [];
      return;
    }
    const predicate = buildWherePredicate(where, bindValues);
    data[tableName] = data[tableName].filter((row) => !predicate(row));
  }

  /**
   * Return raw rows (objects) for a SELECT, honoring WHERE.
   * `columns` projects raw column-order arrays when provided (drizzle raw() path).
   */
  function selectRows(sql: string, bindValues: any[], columns: string[] | null): any[] {
    const { where } = splitWhere(sql);
    const predicate = buildWherePredicate(where, bindValues);
    const rows = (data[extractTableName(sql) || ''] || []).filter(predicate);
    if (!columns) return rows;
    return rows.map((row) => columns.map((c) => normalizeValue(row[c])));
  }

  function makeStatement(query: string, initialBind: any[] = []) {
    let bindValues = initialBind;
    const tableNameForQuery = () => extractTableName(query);

    const stmt = {
      bind: (...values: any[]) => makeStatement(query, values.map(normalizeValue)),
      first: async () => {
        const table = tableNameForQuery();
        if (!table || !data[table]) return null;
        const { where } = splitWhere(query);
        const predicate = buildWherePredicate(where, bindValues);
        const isSelectAll = /^select\s+\*/i.test(query.trim());
        const columns = isSelectAll ? null : parseSelectedColumns(query);
        const rows = data[table].filter(predicate);
        const row = rows[0];
        if (!row) return null;
        if (columns) {
          const arr = columns.map((c) => normalizeValue(row[c]));
          const obj: Row = {};
          columns.forEach((c, i) => { obj[c] = arr[i]; });
          return obj;
        }
        return { ...row };
      },
      all: async () => {
        // Non-mapped drizzle path: expects { results: Row[] } objects.
        const columns = /^select\s+\*/i.test(query.trim()) ? null : parseSelectedColumns(query);
        const rows = selectRows(query, bindValues, columns) as any[];
        const results = columns
          ? rows.map((arr: any[]) => {
              const obj: Row = {};
              columns!.forEach((c, i) => { obj[c] = arr[i]; });
              return obj;
            })
          : rows;
        return { results };
      },
      raw: async () => {
        // Drizzle mapped path: expects arrays of column values in SELECT order.
        const columns = parseSelectedColumns(query);
        return selectRows(query, bindValues, columns);
      },
      run: async () => {
        const table = tableNameForQuery();
        if (!table) return { success: true };
        const upper = query.toUpperCase();
        if (upper.startsWith('INSERT')) {
          handleInsert(query, bindValues, table);
        } else if (upper.startsWith('UPDATE')) {
          handleUpdate(query, bindValues, table);
        } else if (upper.startsWith('DELETE')) {
          handleDelete(query, bindValues, table);
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return stmt;
  }

  return {
    prepare: (query: string) => makeStatement(query),
    async batch(statements: any[]) {
      const results = [];
      for (const s of statements) {
        results.push(await s.all());
      }
      return results;
    },
    // Helper to add test data
    _addData: (table: string, row: Row) => {
      if (data[table]) {
        data[table].push({ ...(TABLE_DEFAULTS[table] || {}), ...row });
      }
    },
    // Helper to clear all data
    _clear: () => {
      Object.keys(data).forEach((key) => {
        data[key] = [];
      });
    },
    // Helper to get data
    _getData: (table: string) => data[table] || [],
  };
}

export function createMockEnv(overrides: Partial<any> = {}) {
  return {
    AI_CHAT_DB: createMockDB(),
    BASIC_AUTH_USER: 'testuser',
    BASIC_AUTH_PASS: 'testpass',
    OPENAI_API_KEY: 'test-api-key',
    OPENAI_BASE_URL: 'https://api.openai.com',
    ...overrides,
  };
}
