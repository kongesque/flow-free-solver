// Match worker executions in production and development without blocking Vite's
// ?worker&url import modules, which must load before the app can start.
export const GENERATOR_WORKER_REQUEST = /\/generator\.worker[^?]*\?[^#]*\brun=/;
export const SOLVER_WORKER_REQUEST = /\/solver\.worker[^?]*\?[^#]*\brun=/;
