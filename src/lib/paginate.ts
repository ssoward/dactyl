/**
 * Cursor-based pagination helpers.
 * The cursor is a base64url-encoded opaque string containing the last-seen row ID.
 */

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}

/**
 * Build a WHERE clause fragment for keyset pagination on `id`.
 * Caller must append to their existing WHERE clause (AND'd in).
 *
 * Returns the SQL fragment and params array for safe parameterization.
 * Caller is responsible for tracking the parameter index offset.
 */
export function buildCursorWhere(
  cursor?: string,
): { sql: string; params: unknown[] } {
  if (!cursor) {
    return { sql: '', params: [] };
  }
  const id = decodeCursor(cursor);
  return {
    sql: 'id > $1',
    params: [id],
  };
}
