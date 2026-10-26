import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
type NativeContext = { token: string; memo: Map<string, Promise<unknown>> };
const context = new AsyncLocalStorage<NativeContext>();
export function withNativeAuth<T>(token: string, operation: () => Promise<T>) { return context.run({ token, memo: new Map() }, operation); }
export function nativeAccessToken() { return context.getStore()?.token; }
export function memoNativeRequest<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const store = context.getStore();
  if (!store) return operation();
  if (!store.memo.has(key)) store.memo.set(key, operation());
  return store.memo.get(key) as Promise<T>;
}
