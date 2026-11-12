/**
 * Errors of the app, kept on the phone (there is no error service: nothing is sent anywhere).
 * In the browser's small storage rather than the database, so that a failing database can still be
 * recorded. Only the count of the last 7 days goes into the pilot summary.
 */
export interface AppError {
  at: string;
  /** Where it was caught: the page, a promise nobody handled, a screen, or saving a sale. */
  where: 'page' | 'promise' | 'screen' | 'sale';
  message: string;
}

const KEY = 'caixa.errors';
/** The most recent errors kept (the oldest are dropped). */
export const MAX_ERRORS = 50;

const WHERE: readonly AppError['where'][] = ['page', 'promise', 'screen', 'sale'];

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido';
}

/** Reads the kept errors, most recent first; anything malformed is ignored. */
export function readErrors(): AppError[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is AppError =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as AppError).at === 'string' &&
        typeof (e as AppError).message === 'string' &&
        WHERE.includes((e as AppError).where),
    );
  } catch {
    return [];
  }
}

/** Keeps an error (never throws: recording an error must not cause another one). */
export function recordError(where: AppError['where'], error: unknown, now = new Date()): void {
  try {
    const entry: AppError = { at: now.toISOString(), where, message: describe(error).slice(0, 200) };
    localStorage.setItem(KEY, JSON.stringify([entry, ...readErrors()].slice(0, MAX_ERRORS)));
  } catch {
    /* storage unavailable or full: nothing more can be done */
  }
}

/** How many errors since a moment (e.g. the last 7 days). */
export function errorsSince(errors: AppError[], since: Date): number {
  const from = since.toISOString();
  return errors.filter((e) => e.at >= from).length;
}
