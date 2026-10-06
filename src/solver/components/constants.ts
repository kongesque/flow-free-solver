export const DEFAULT_SIZE = 5;
export const SIZE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const RESTRICT_Z3_TO_LARGE_GRIDS = false;

export const COLORS: Record<number, string> = {
    1: '#FF0000',  // R - Red
    2: '#5577FF',  // B - Blue
    3: '#FFFF00',  // Y - Yellow
    4: '#008000',  // G - Green
    5: '#FFA500',  // O - Orange
    6: '#00FFFF',  // C - Cyan
    7: '#FF00FF',  // M - Magenta
    8: '#B95C6E',  // m - Maroon
    9: '#AA62BC',  // P - Purple
    10: '#808080', // A - Gray
    11: '#FFFFFF', // W - White
    12: '#00FF00', // g - Bright Green
    13: '#D2B48C', // T - Tan
    14: '#6868C8', // b - Indigo
    15: '#008B8B', // c - Dark Cyan
    16: '#FFC0CB', // p - Pink
};

export const COLOR_NAMES: Record<number, string> = {
    1: 'Red', 2: 'Blue', 3: 'Yellow', 4: 'Green', 5: 'Orange', 6: 'Cyan',
    7: 'Magenta', 8: 'Maroon', 9: 'Purple', 10: 'Gray', 11: 'White',
    12: 'Bright green', 13: 'Tan', 14: 'Indigo', 15: 'Dark cyan', 16: 'Pink',
};

// Choose readable pair-number text once for each display color.
export const COLOR_INK: Record<number, string> = Object.fromEntries(Object.entries(COLORS).map(([id, hex]) => {
    const [r, g, b] = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return [id, .2126 * r + .7152 * g + .0722 * b > .179 ? '#000' : '#fff'];
}));

export type SolverType = 'astar' | 'z3' | 'heuristic_bfs';
