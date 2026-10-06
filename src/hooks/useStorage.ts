import type { GameMode } from '../solver/logic/game-modes';
import type { Wall } from '../solver/logic/walls';

/**
 * IndexedDB Storage Hook for Flow Free Solver
 * Persists puzzle state to prevent data loss on refresh/crashes
 */

const DB_NAME = 'flow-solver-db';
const DB_VERSION = 1;
const STORE_NAME = 'puzzle-state';
const STATE_KEY = 'current';

export interface PuzzleState {
    /** Legacy square saves use size; new saves store independent dimensions. */
    size?: number;
    width?: number;
    height?: number;
    mode?: GameMode;
    walls?: Wall[];
    board: number[][];
    solverType: 'astar' | 'z3' | 'heuristic_bfs';
    activeColor: number;
    isPlacingSecond: boolean;
    generatedSolution?: number[][] | null;
    savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

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

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.warn('Failed to save puzzle state:', error);
    }
}

export async function loadPuzzleState(): Promise<PuzzleState | null> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(STATE_KEY);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('Failed to load puzzle state:', error);
        return null;
    }
}

export async function clearPuzzleState(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(STATE_KEY);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.warn('Failed to clear puzzle state:', error);
    }
}
