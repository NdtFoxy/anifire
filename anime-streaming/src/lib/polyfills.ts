/**
 * Runtime gaps on the oldest browsers we still serve (Smart TV engines lag years
 * behind desktop Chrome). Next.js does not polyfill these; the code base uses
 * them, so they are provided once here, before any component runs.
 */
if (typeof Promise.withResolvers !== "function") {
  // Promise.withResolvers: Chrome 119, Safari 17.4 — missing on most TVs.
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      // Executor form is the only way to build this primitive itself.
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

export {};
