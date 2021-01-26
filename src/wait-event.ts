import { EventEmitter } from "events";
import { breakableSleepMs } from "./utils";

export interface IWaitEventObject {
    wait(ms?: number): Promise<boolean>;
    isSet(): boolean;
    set(): void;
    clear(): void;
    _destroy(): void;
}

export function createWaitEventObject(): IWaitEventObject {
    const f = new EventEmitter();
    const producePromise = (): Promise<boolean> => new Promise<boolean>(r => {
        // if users doesn't have anything in event loop, this library could mis-behave 
        // and unexpectedly close down node process for user.
        // https://github.com/nodejs/node/issues/22088
        const keepAliveEventLoop = setInterval(() => null, 86400 * 1e3);
        f.once('done', (wasSet) => {
            clearInterval(keepAliveEventLoop);
            r(wasSet);
        });
    });

    let donePromise = producePromise();
    let isSet = false;

    async function awaitDonePromise(): Promise<boolean> {
        // hang promise if another context uses clear()
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
            // extend the current promise.
            donePromise = producePromise();
        },
        _destroy(): void {
            isSet = false;
            // emit clear interval, we don't need to keep event loop anymore.
            f.emit('done', false);
            donePromise = Promise.resolve(true);
        }
    };
}