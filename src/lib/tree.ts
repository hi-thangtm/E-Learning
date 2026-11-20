/**
 * Tiện ích cho dữ liệu dạng cây (phòng ban...). Thuần TypeScript — dùng được cả server và trình duyệt.
 * Mỗi nút có `id` và `parentId` (null = cấp cao nhất).
 */

export type TreeNode = { id: string; parentId: string | null };

/** parentId -> danh sách con (key "" = các nút cấp cao nhất). Giữ nguyên thứ tự đầu vào. */
export function buildChildrenMap<T extends TreeNode>(rows: T[]): Map<string, T[]> {
  const ids = new Set(rows.map((r) => r.id));
  const map = new Map<string, T[]>();
  for (const row of rows) {
    // Cha không nằm trong danh sách -> coi như cấp cao nhất
    const key = row.parentId && ids.has(row.parentId) ? row.parentId : "";
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Danh sách id tổ tiên (cha, ông...) của một nút. Dừng nếu gặp vòng lặp. */
export function getAncestorIds(id: string, parentOf: Map<string, string | null>): string[] {
  const result: string[] = [];
  const seen = new Set<string>([id]);
  let current = parentOf.get(id) ?? null;
  while (current && !seen.has(current)) {
    result.push(current);
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return result;
}

/** Tập id con, cháu... của một nút (không gồm chính nó). */
export function getDescendantIds<T extends TreeNode>(id: string, childrenMap: Map<string, T[]>): Set<string> {
  const result = new Set<string>();
  const stack = [...(childrenMap.get(id) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (result.has(node.id)) continue;
    result.add(node.id);
    stack.push(...(childrenMap.get(node.id) ?? []));
  }
  return result;
}

/**
 * Đặt `parentId = newParentId` cho nút `id` có tạo vòng lặp không
 * (cha mới là chính nó hoặc là con / cháu của nó).
 */
export function wouldCreateCycle(id: string, newParentId: string | null, parentOf: Map<string, string | null>): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  return getAncestorIds(newParentId, parentOf).includes(id);
}

export type FlatTreeItem<T> = { row: T; depth: number; hasChildren: boolean };

/**
 * Trải cây thành danh sách theo thứ tự hiển thị (cha trước, con sau).
 * Chỉ đi vào nhánh có id nằm trong `expanded` (truyền "all" để mở hết).
 */
export function flattenTree<T extends TreeNode>(
  rows: T[],
  expanded: Set<string> | "all",
): FlatTreeItem<T>[] {
  const childrenMap = buildChildrenMap(rows);
  const result: FlatTreeItem<T>[] = [];
  const seen = new Set<string>();

  function walk(parentKey: string, depth: number) {
    for (const row of childrenMap.get(parentKey) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const children = childrenMap.get(row.id) ?? [];
      result.push({ row, depth, hasChildren: children.length > 0 });
      if (children.length > 0 && (expanded === "all" || expanded.has(row.id))) walk(row.id, depth + 1);
    }
  }

  walk("", 0);
  return result;
}

/** Chuẩn hoá chuỗi để tìm kiếm: chữ thường, bỏ dấu tiếng Việt (đ -> d). */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
