/*
    SPDX-License-Identifier: MIT
*/

interface DTreeLeaf {
  id: string;
}
interface DTreeNode {
  first: DTreeLeaf | DTreeNode;
  second: DTreeLeaf | DTreeNode;
  horiz: boolean;
  ratio: number;
}
type DTreeItem = DTreeLeaf | DTreeNode;

/** Dynamic BSP layout: a new window splits the most recently focused window. */
class DynamicTreeLayout implements ILayout {
  public static readonly id = "DynamicTreeLayout";
  public readonly classID = DynamicTreeLayout.id;
  public readonly capacity?: number | null;

  public get description(): string {
    return "DTree";
  }

  private root: DTreeItem | null = null;
  private rects: { [id: string]: Rect } = {};

  constructor(capacity?: number | null) {
    this.capacity = capacity !== undefined ? capacity : null;
  }

  public apply(
    ctx: EngineContext,
    tileables: WindowClass[],
    area: Rect,
    gap: number
  ): void {
    tileables.forEach((t) => (t.state = WindowState.Tiled));

    const present: { [id: string]: boolean } = {};
    tileables.forEach((t) => (present[t.id] = true));
    this.root = this.prune(this.root, present);

    const known: { [id: string]: boolean } = {};
    this.leaves(this.root, known);

    tileables.forEach((t) => {
      if (known[t.id]) return;
      if (this.root === null) {
        this.root = { id: t.id };
      } else {
        const target = this.pickTarget(tileables, known);
        const r = this.rects[target] || area;
        this.root = this.split(this.root, target, t.id, r.width >= r.height);
      }
      known[t.id] = true;
    });

    const out: { [id: string]: Rect } = {};
    this.layout(this.root, area, gap, out);
    this.rects = out;
    tileables.forEach((t) => (t.geometry = out[t.id]));
  }

  public adjust(
    area: Rect,
    tiles: WindowClass[],
    basis: WindowClass,
    delta: RectDelta,
    gap: number
  ): void {
    if (this.root !== null) this.adjustNode(this.root, area, basis.id, delta, gap);
  }

  private hasLeaf(n: DTreeItem, id: string): boolean {
    if ((n as DTreeLeaf).id !== undefined) return (n as DTreeLeaf).id === id;
    const node = n as DTreeNode;
    return this.hasLeaf(node.first, id) || this.hasLeaf(node.second, id);
  }

  private adjustNode(
    n: DTreeItem,
    area: Rect,
    id: string,
    delta: RectDelta,
    gap: number
  ): RectDelta {
    if ((n as DTreeLeaf).id !== undefined) return delta;
    const node = n as DTreeNode;
    const idx = this.hasLeaf(node.first, id) ? 0 : 1;
    const [a1, a2] = LayoutUtils.splitAreaHalfWeighted(
      area,
      node.ratio,
      gap,
      node.horiz
    );
    delta = this.adjustNode(
      idx === 0 ? node.first : node.second,
      idx === 0 ? a1 : a2,
      id,
      delta,
      gap
    );
    node.ratio = LayoutUtils.adjustAreaHalfWeights(
      area,
      node.ratio,
      gap,
      idx,
      delta,
      node.horiz
    );
    if (node.horiz)
      return idx === 0
        ? new RectDelta(0, delta.west, delta.south, delta.north)
        : new RectDelta(delta.east, 0, delta.south, delta.north);
    return idx === 0
      ? new RectDelta(delta.east, delta.west, 0, delta.north)
      : new RectDelta(delta.east, delta.west, delta.south, 0);
  }

  public clone(): ILayout {
    return new DynamicTreeLayout(this.capacity);
  }

  public toString(): string {
    return "DynamicTreeLayout()";
  }

  private pickTarget(
    tileables: WindowClass[],
    known: { [id: string]: boolean }
  ): string {
    let best: WindowClass | null = null;
    tileables.forEach((t) => {
      if (!known[t.id]) return;
      if (best === null || t.timestamp > best.timestamp) best = t;
    });
    return (best as unknown as WindowClass).id;
  }

  private prune(
    n: DTreeItem | null,
    present: { [id: string]: boolean }
  ): DTreeItem | null {
    if (n === null) return null;
    if ((n as DTreeLeaf).id !== undefined)
      return present[(n as DTreeLeaf).id] ? n : null;
    const node = n as DTreeNode;
    const a = this.prune(node.first, present);
    const b = this.prune(node.second, present);
    if (a === null) return b;
    if (b === null) return a;
    node.first = a;
    node.second = b;
    return node;
  }

  private leaves(n: DTreeItem | null, acc: { [id: string]: boolean }): void {
    if (n === null) return;
    if ((n as DTreeLeaf).id !== undefined) {
      acc[(n as DTreeLeaf).id] = true;
      return;
    }
    this.leaves((n as DTreeNode).first, acc);
    this.leaves((n as DTreeNode).second, acc);
  }

  private split(
    n: DTreeItem,
    target: string,
    newId: string,
    horiz: boolean
  ): DTreeItem {
    if ((n as DTreeLeaf).id !== undefined) {
      return (n as DTreeLeaf).id === target
        ? { first: n, second: { id: newId }, horiz: horiz, ratio: 0.5 }
        : n;
    }
    const node = n as DTreeNode;
    node.first = this.split(node.first, target, newId, horiz);
    node.second = this.split(node.second, target, newId, horiz);
    return node;
  }

  private layout(
    n: DTreeItem | null,
    area: Rect,
    gap: number,
    out: { [id: string]: Rect }
  ): void {
    if (n === null) return;
    if ((n as DTreeLeaf).id !== undefined) {
      out[(n as DTreeLeaf).id] = area;
      return;
    }
    const node = n as DTreeNode;
    const [a1, a2] = LayoutUtils.splitAreaHalfWeighted(
      area,
      node.ratio,
      gap,
      node.horiz
    );
    this.layout(node.first, a1, gap, out);
    this.layout(node.second, a2, gap, out);
  }
}
