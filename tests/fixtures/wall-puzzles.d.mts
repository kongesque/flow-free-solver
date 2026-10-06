type Wall = { x: number; y: number; side: 'right' | 'down' };
export function wallCorridor(width?: number, height?: number): { input: string; walls: Wall[] };
export const wallDetour: { input: string; walls: Wall[] };
export function wallText(walls: Wall[]): string;
