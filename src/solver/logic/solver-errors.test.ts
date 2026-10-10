import { isSearchLimitError, SearchLimitError } from './solver-errors';

test('recognizes a search limit from a separately loaded solver chunk', () => {
    class OtherSearchLimitError extends Error {
        constructor() { super('Search limit reached. Your puzzle is preserved.'); this.name = 'SearchLimitError'; }
    }
    const error = new OtherSearchLimitError();
    expect(error instanceof SearchLimitError).toBe(false);
    expect(isSearchLimitError(error)).toBe(true);
    expect(isSearchLimitError(new SearchLimitError())).toBe(true);
});

test('keeps unrelated errors distinct from exhausted searches', () => {
    for (const error of [new Error('Wasm load failed'), null, 'SearchLimitError', { name: 'SearchLimitError' }]) {
        expect(isSearchLimitError(error)).toBe(false);
    }
});
