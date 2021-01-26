export function sleepMs(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function breakableSleepMs(ms: number): {
    promise: Promise<void>; cancel(): void;
} {
    let timeout: number;
    let resolvable: () => void;
    return {
        promise: new Promise<void>((resolve) => {
            resolvable = resolve;
            timeout = setTimeout(resolve, ms);
        }),
        cancel(): void {
            clearTimeout(timeout);
            resolvable();
        }
    };
}