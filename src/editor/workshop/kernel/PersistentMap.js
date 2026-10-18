const height = node => node?.height ?? 0;
const size = node => node?.size ?? 0;
const node = (key, value, left = null, right = null) => Object.freeze({ key, value, left, right,
  height: 1 + Math.max(height(left), height(right)), size: 1 + size(left) + size(right) });
function rotateLeft(root) {
  const right = root.right;
  return node(right.key, right.value, node(root.key, root.value, root.left, right.left), right.right);
}
function rotateRight(root) {
  const left = root.left;
  return node(left.key, left.value, left.left, node(root.key, root.value, left.right, root.right));
}
function balance(root) {
  if (height(root.left) - height(root.right) > 1) {
    if (height(root.left.right) > height(root.left.left)) root = node(root.key, root.value, rotateLeft(root.left), root.right);
    return rotateRight(root);
  }
  if (height(root.right) - height(root.left) > 1) {
    if (height(root.right.left) > height(root.right.right)) root = node(root.key, root.value, root.left, rotateRight(root.right));
    return rotateLeft(root);
  }
  return root;
}
function put(root, key, value, remove) {
  if (!root) return remove ? null : node(key, value);
  if (key < root.key) return balance(node(root.key, root.value, put(root.left, key, value, remove), root.right));
  if (key > root.key) return balance(node(root.key, root.value, root.left, put(root.right, key, value, remove)));
  if (!remove) return node(key, value, root.left, root.right);
  if (!root.left) return root.right;
  if (!root.right) return root.left;
  let successor = root.right;
  while (successor.left) successor = successor.left;
  return balance(node(successor.key, successor.value, root.left, put(root.right, successor.key, null, true)));
}
function* entries(root) {
  if (!root) return;
  yield* entries(root.left); yield [root.key, root.value]; yield* entries(root.right);
}
/** Immutable AVL tree: edits copy O(log n) nodes and retain no revision chain. */
export class PersistentMap {
  constructor(root = null) { this.root = root; Object.freeze(this); }
  static from(entries) {
    const sorted = [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const build = (lo, hi) => {
      if (lo >= hi) return null;
      const mid = (lo + hi) >>> 1;
      return node(...sorted[mid], build(lo, mid), build(mid + 1, hi));
    };
    return new PersistentMap(build(0, sorted.length));
  }
  get size() { return size(this.root); }
  get(key) {
    let current = this.root;
    while (current) {
      if (key === current.key) return current.value;
      current = key < current.key ? current.left : current.right;
    }
    return undefined;
  }
  has(key) { return this.get(key) !== undefined; }
  set(key, value) { return new PersistentMap(put(this.root, key, value, false)); }
  delete(key) { return new PersistentMap(put(this.root, key, null, true)); }
  *values() { for (const [, value] of entries(this.root)) yield value; }
  [Symbol.iterator]() { return entries(this.root); }
}
