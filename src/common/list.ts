/**
 * Every collection endpoint in this API uses the same payload shape:
 *
 * ```json
 * { "items": [], "total": 12 }
 * ```
 *
 * Paginated endpoints add `page`, `pageSize` and `totalPages`. The envelope's
 * `data` field carries this object, so clients never see a bare array.
 */
export interface ListPayload<T> {
  items: T[];
  total: number;
}

export function list<T>(items: T[]): ListPayload<T> {
  return { items, total: items.length };
}
