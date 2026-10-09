import { GAME_MODES, requireStandardMode } from './game-modes';

test('Standard is available; future modes cannot use the Standard solver pipeline', () => {
    expect(() => requireStandardMode()).not.toThrow();
    expect(GAME_MODES.standard.available).toBe(true);
    expect(GAME_MODES.standard.label).toBe('Classic');
    for (const mode of ['bridges', 'hexes', 'warps'] as const) {
        expect(GAME_MODES[mode].available).toBe(mode !== 'hexes');
        expect(() => requireStandardMode(mode)).toThrow('not available yet');
    }
});
