// Flow Free's label order, using the existing solver and saved-board color IDs.
export const COLOR_PLACEMENT_ORDER = [1, 4, 2, 3, 5, 6, 7, 8, 9, 11, 10, 12, 13, 14, 15, 16] as const;

export function nextPlacementColor(board: number[][]): number {
    const counts = new Map<number, number>();
    for (const column of board) for (const color of column) {
        if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    return COLOR_PLACEMENT_ORDER.find(color => (counts.get(color) ?? 0) < 2) ?? 17;
}
