export class SearchLimitError extends Error {
    constructor() {
        super('Search limit reached. Your puzzle is preserved.');
        this.name = 'SearchLimitError';
    }
}

// The entry worker has a per-run query string. Production chunks can import
// its canonical URL, creating another copy of this class in the same worker.
export function isSearchLimitError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'SearchLimitError';
}
