import type { GameMode } from '../solver/logic/game-modes';
import type { Bridge, WarpSeam } from '../solver/logic/topology';
import type { Wall } from '../solver/logic/walls';
import type { PuzzleSolution } from '../solver/logic/solution';
import type { Block } from '../solver/logic/blocks';

/**
 * IndexedDB Storage Hook for Flow Free Solver
 * Persists puzzle state to prevent data loss on refresh/crashes
 */

const DB_NAME = 'flow-solver-db';
const DB_VERSION = 1;
const STORE_NAME = 'puzzle-state';
const STATE_KEY = 'current';

export interface PuzzleDraft {
    width: number;
    height: number;
    board: number[][];
    walls: Wall[];
    bridges: Bridge[];
    warps: WarpSeam[];
    blocks?: Block[];
    solverType: 'astar' | 'z3' | 'heuristic_bfs';
    activeColor: number;
    isPlacingSecond: boolean;
    generatedSolution: number[][] | null;
    generatedPathSolution?: PuzzleSolution | null;
}

export interface PuzzleState {
    schemaVersion?: 2;
    drafts?: Partial<Record<GameMode, PuzzleDraft>>;
    /** Legacy square saves use size; new saves store independent dimensions. */
    size?: number;
    width?: number;
    height?: number;
    mode?: GameMode;
    walls?: Wall[];
    bridges?: Bridge[];
    warps?: WarpSeam[];
    blocks?: Block[];
    board: number[][];
    solverType: 'astar' | 'z3' | 'heuristic_bfs';
    activeColor: number;
    isPlacingSecond: boolean;
    generatedSolution?: number[][] | null;
    generatedPathSolution?: PuzzleSolution | null;
    savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => { dbPromise = null; reject(request.error); };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); dbPromise = null; };
            db.onclose = () => { dbPromise = null; };
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });

    return dbPromise;
}

export async function savePuzzleState(state: Omit<PuzzleState, 'savedAt'>): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const stateWithTimestamp: PuzzleState = {
            ...state,
            savedAt: Date.now(),
        };

        store.put(stateWithTimestamp, STATE_KEY);

        return await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
        });
    } catch (error) {
        console.warn('Failed to save puzzle state:', error);
    }
}

export async function loadPuzzleState(): Promise<PuzzleState | null> {
    // Retry interrupted transactions once with a fresh connection. Await the
    // request inside try so an asynchronous rejection cannot bypass recovery.
    for (let attempt = 0; attempt < 2; attempt++) {
        let db: IDBDatabase | null = null;
        try {
            db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
            return await new Promise<PuzzleState | null>((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
                tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
            });
        } catch (error) {
            db?.close();
            dbPromise = null;
            if (attempt === 1) console.warn('Failed to load puzzle state:', error);
        }
    }
    return null;
}

export async function clearPuzzleState(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(STATE_KEY);

        return await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
        });
    } catch (error) {
        console.warn('Failed to clear puzzle state:', error);
    }
}
