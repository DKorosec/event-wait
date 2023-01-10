import { EventEmitter } from "events";
import { breakableSleepMs } from "./utils";

let producePromiseCounter = 0;
let keepAliveEventLoopHandle: ReturnType<typeof setInterval>;
let keepPromiseResolutionHaltExit = true;

export interface IWaitEventObject {
    wait(ms?: number): Promise<boolean>;
    isSet(): boolean;
    set(): void;
    clear(): void;
    _destroy(): void;
}

export function ignorePromiseResolutionHaltExit(): void {
    keepPromiseResolutionHaltExit = false;
    clearInterval(keepAliveEventLoopHandle);
}

export function createWaitEventObject(): IWaitEventObject {
    const f = new EventEmitter();
    const producePromise = (): Promise<boolean> => new Promise<boolean>(r => {
        // create interval when first promise is created.
        if (producePromiseCounter++ === 0 && keepPromiseResolutionHaltExit) {
            // if users doesn't have anything in event loop, this library could mis-behave 
            // and unexpectedly close down node process for user. (because our promise resolves on event and is not in event loop)
            // https://github.com/nodejs/node/issues/22088
            keepAliveEventLoopHandle = setInterval(() => null, 86400 * 1e3);
        }

        f.once('done', (wasSet: boolean) => {
            // clear interval when last promise is resolved.
            if (--producePromiseCounter === 0 && keepPromiseResolutionHaltExit) {
                clearInterval(keepAliveEventLoopHandle);
            }
            r(wasSet);
        });
    });

    let donePromise = producePromise();
    let isSet = false;

    async function awaitDonePromise(): Promise<boolean> {
        // hang promise if another context uses clear().
        // It's the duty of those who set promise to false to extend it 
        // and not causing to block - look at: this.clear()
        while (!await donePromise);
        return true;
    }

    return {
        async wait(ms?: number): Promise<boolean> {
            if (isSet) {
                return true;
            }

            if (ms === undefined) {
                return awaitDonePromise();
            }
            const sleep = breakableSleepMs(ms);
            const result = await Promise.race([awaitDonePromise(), sleep.promise.then(() => false)]);
            // we don't need the sleep (timeout) in event loop anymore! 
            // otherwise if user code exits we would block the process unit the sleep is done
            sleep.cancel();
            return result;
        },
        isSet(): boolean {
            return isSet;
        },
        set(): void {
            isSet = true;
            f.emit('done', true);
        },
        clear(): void {
            isSet = false;
            // prevent hanging promise.
            f.emit('done', false);
            // always create new promise to not block in 'this.awaitDonePromise()'.
            // we are just "extending" the current promise in time with resetting it.
            // new promise is needed if current was already resolved (and with clear we want it to start as unresolved.)
            donePromise = producePromise();
        },
        _destroy(): void {
            isSet = false;
            // emit clear interval, we don't need to keep event loop anymore.
            f.emit('done', false);
            // ensure immediate exit of 'this.awaitDonePromise()'
            donePromise = Promise.resolve(true);
        }
    };
}