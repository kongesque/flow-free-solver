export class SearchLimitError extends Error {
    constructor() {
        super('Search limit reached. Your puzzle is preserved.');
        this.name = 'SearchLimitError';
    }
}
