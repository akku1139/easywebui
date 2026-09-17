// Mock D1 Database for testing
export function createMockDB() {
  const data: Record<string, any[]> = {
    user_facts: [],
    conversation_summaries: [],
    conversations: [],
    mcp_servers: [],
    api_endpoints: [],
    oauth_states: [],
  };

  return {
    prepare: (query: string) => {
      const tableName = query.match(/FROM\s+"?(\w+)"?/i)?.[1] ||
                       query.match(/INTO\s+"?(\w+)"?/i)?.[1] ||
                       query.match(/UPDATE\s+"?(\w+)"?/i)?.[1] ||
                       query.match(/DELETE\s+FROM\s+"?(\w+)"?/i)?.[1];
      
      let bindValues: any[] = [];
      
      return {
        bind: (...values: any[]) => {
          bindValues = values;
          return {
            first: async () => {
              if (!tableName || !data[tableName]) return null;
              return data[tableName][0] || null;
            },
            all: async () => {
              if (!tableName || !data[tableName]) return { results: [] };
              return { results: data[tableName] };
            },
            raw: async () => data[tableName] || [],
            run: async () => {
              if (!tableName) return;
              
              // Handle INSERT
              if (query.toUpperCase().includes('INSERT')) {
                const newRow: any = {};
                const columns = query.match(/\(([^)]+)\)/)?.[1]?.split(',').map(c => c.trim());
                if (columns) {
                  columns.forEach((col, i) => {
                    newRow[col] = bindValues[i];
                  });
                  data[tableName].push(newRow);
                }
              }
              
              // Handle DELETE
              if (query.toUpperCase().includes('DELETE')) {
                const id = bindValues[0];
                data[tableName] = data[tableName].filter(row => row.id !== id);
              }
              
              // Handle UPDATE
              if (query.toUpperCase().includes('UPDATE')) {
                // Check if this is a simple UPDATE without WHERE (like "UPDATE api_endpoints SET is_default = 0")
                if (!query.toUpperCase().includes('WHERE')) {
                  // Update all rows - extract values from SQL directly
                  const setClause = query.match(/SET\s+(.+?)$/i)?.[1];
                  if (setClause) {
                    const assignments = setClause.split(',').map(s => s.trim());
                    data[tableName].forEach((row, rowIndex) => {
                      assignments.forEach((assignment) => {
                        const match = assignment.match(/(\w+)\s*=\s*(.+)/);
                        if (match) {
                          const col = match[1].trim();
                          let value = match[2].trim();
                          // Parse value (handle numbers, strings, etc.)
                          if (value === '0' || value === '1') {
                            data[tableName][rowIndex][col] = parseInt(value);
                          } else if (value.startsWith("'") && value.endsWith("'")) {
                            data[tableName][rowIndex][col] = value.slice(1, -1);
                          } else if (!isNaN(Number(value))) {
                            data[tableName][rowIndex][col] = Number(value);
                          }
                        }
                      });
                    });
                  }
                } else {
                  // Update specific row by id
                  const id = bindValues[bindValues.length - 1];
                  const rowIndex = data[tableName].findIndex(row => row.id === id);
                  if (rowIndex >= 0) {
                    const updates = query.match(/SET\s+(.+?)\s+WHERE/i)?.[1]?.split(',').map(s => s.trim());
                    if (updates) {
                      updates.forEach((update, i) => {
                        const col = update.split('=')[0].trim();
                        data[tableName][rowIndex][col] = bindValues[i];
                      });
                    }
                  }
                }
              }
              
              return { success: true };
            },
          };
        },
        first: async () => {
          if (!tableName || !data[tableName]) return null;
          return data[tableName][0] || null;
        },
        all: async () => {
          if (!tableName || !data[tableName]) return { results: [] };
          return { results: data[tableName] };
        },
        raw: async () => data[tableName] || [],
        run: async () => {
          // Handle UPDATE without bind (like "UPDATE api_endpoints SET is_default = 0")
          if (tableName && query.toUpperCase().includes('UPDATE') && !query.toUpperCase().includes('WHERE')) {
            const setClause = query.match(/SET\s+(.+?)$/i)?.[1];
            if (setClause) {
              const assignments = setClause.split(',').map(s => s.trim());
              data[tableName].forEach((row: any, rowIndex: number) => {
                assignments.forEach((assignment) => {
                  const match = assignment.match(/(\w+)\s*=\s*(.+)/);
                  if (match) {
                    const col = match[1].trim();
                    let value = match[2].trim();
                    // Parse value (handle numbers, strings, etc.)
                    if (value === '0' || value === '1') {
                      data[tableName][rowIndex][col] = parseInt(value);
                    } else if (value.startsWith("'") && value.endsWith("'")) {
                      data[tableName][rowIndex][col] = value.slice(1, -1);
                    } else if (!isNaN(Number(value))) {
                      data[tableName][rowIndex][col] = Number(value);
                    }
                  }
                });
              });
            }
          }
          return { success: true };
        },
      };
    },
    // Helper to add test data
    _addData: (table: string, row: any) => {
      if (data[table]) {
        data[table].push(row);
      }
    },
    // Helper to clear all data
    _clear: () => {
      Object.keys(data).forEach(key => {
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
