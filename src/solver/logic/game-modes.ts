export type GameMode = 'standard' | 'bridges' | 'hexes' | 'warps';

export const GAME_MODES: Record<GameMode, { label: string; available: boolean }> = {
    standard: { label: 'Standard', available: true },
    bridges: { label: 'Bridges', available: true },
    hexes: { label: 'Hexes', available: false },
    warps: { label: 'Warps', available: true },
};

/** Keep future modes out of Standard's four-neighbor solver pipeline. */
export function requireStandardMode(mode: GameMode = 'standard') {
    if (mode !== 'standard') throw new Error(`${GAME_MODES[mode]?.label ?? mode} mode is not available yet`);
}
