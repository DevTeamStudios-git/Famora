// Shared client/server contract types.

/** Standard result shape returned by server actions. */
export type ActionState<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionState<T> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionState<never> {
  return { ok: false, error, fieldErrors };
}

/** Unauthorized shorthand used across server actions. */
export function unauthorized(): ActionState<never> {
  return fail("You are not authorized to perform this action.");
}