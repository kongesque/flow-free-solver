export const DEFAULT_SIZE = 5;
export const SIZE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const RESTRICT_Z3_TO_LARGE_GRIDS = false;

export const COLORS: Record<number, string> = {
    1: '#FF0000',  // R - Red
    2: '#0000FF',  // B - Blue
    3: '#FFFF00',  // Y - Yellow
    4: '#008000',  // G - Green
    5: '#FFA500',  // O - Orange
    6: '#00FFFF',  // C - Cyan
    7: '#FF00FF',  // M - Magenta
    8: '#800000',  // m - Maroon
    9: '#800080',  // P - Purple
    10: '#808080', // A - Gray
    11: '#FFFFFF', // W - White
    12: '#00FF00', // g - Bright Green
    13: '#D2B48C', // T - Tan
    14: '#00008B', // b - Dark Blue
    15: '#008B8B', // c - Dark Cyan
    16: '#FFC0CB', // p - Pink
};

export type SolverType = 'astar' | 'z3' | 'heuristic_bfs';
