const inFlight = new Map<string, Promise<any>>();

export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fn();
    inFlight.set(key, promise);

    const clear = () => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
    };

    promise.then(clear, clear);

    return promise;
}
