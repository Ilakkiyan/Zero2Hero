import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// jsdom under Node 26 doesn't expose a working Web Storage (Node ships its own
// experimental, file-backed `localStorage` that stays undefined here). Install a
// small in-memory Storage so the bring-your-own-key / provider-preference code
// that reads `localStorage` works in component + lib tests.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
}

function installStorage(name: "localStorage" | "sessionStorage") {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
  }
}

if (typeof window !== "undefined") {
  installStorage("localStorage");
  installStorage("sessionStorage");

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Runs for every test file regardless of environment. The DOM-only bits are
// guarded so node-environment files (API routes, lib units) don't blow up on a
// missing `window`/`localStorage`.
afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
