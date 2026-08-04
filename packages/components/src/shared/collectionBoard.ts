export interface CollectionBoardPlacement {
  itemId: string;
  columnId: string;
}

export interface CollectionBoardMove {
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
  fromIndex: number;
  toIndex: number;
}

export function collectionBoardColumnItems(placements: readonly CollectionBoardPlacement[], columnId: string): CollectionBoardPlacement[] {
  return placements.filter((placement) => placement.columnId === columnId);
}

export function moveCollectionBoardItem(
  placements: readonly CollectionBoardPlacement[],
  itemId: string,
  toColumnId: string,
  requestedIndex: number,
): { placements: CollectionBoardPlacement[]; move?: CollectionBoardMove } {
  const current = placements.find((placement) => placement.itemId === itemId);
  if (!current) return { placements: [...placements] };

  const sourceItems = collectionBoardColumnItems(placements, current.columnId);
  const fromIndex = sourceItems.findIndex((placement) => placement.itemId === itemId);
  const targetItems = collectionBoardColumnItems(placements, toColumnId).filter((placement) => placement.itemId !== itemId);
  const toIndex = Math.max(0, Math.min(requestedIndex, targetItems.length));
  if (current.columnId === toColumnId && fromIndex === toIndex) return { placements: [...placements] };

  const byColumn = new Map<string, CollectionBoardPlacement[]>();
  for (const placement of placements) {
    if (placement.itemId === itemId) continue;
    const members = byColumn.get(placement.columnId) ?? [];
    members.push(placement);
    byColumn.set(placement.columnId, members);
  }
  const target = byColumn.get(toColumnId) ?? [];
  target.splice(toIndex, 0, { itemId, columnId: toColumnId });
  byColumn.set(toColumnId, target);

  const columnOrder = [...new Set([...placements.map((placement) => placement.columnId), toColumnId])];
  return {
    placements: columnOrder.flatMap((columnId) => byColumn.get(columnId) ?? []),
    move: { itemId, fromColumnId: current.columnId, toColumnId, fromIndex, toIndex },
  };
}
