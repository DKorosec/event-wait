import { NodeContainer } from "./node-container";
import { createWaitEventObject, IWaitEventObject } from "./wait-event";

export interface IConsumerProducerEventObject {
    consume(ms?: number): Promise<boolean>;
    produce(): void;
}

export function createConsumerProducerEventObject(initialProducts = 0): IConsumerProducerEventObject {
    const onEmptyConsume = new NodeContainer<IWaitEventObject>();
    let productCnt = initialProducts;
    return {
        async consume(ms?: number): Promise<boolean> {
            if (productCnt > 0) {
                --productCnt;
                return true;
            }
            const p = createWaitEventObject();
            const consumeNode = onEmptyConsume.push(p);
            const success = await p.wait(ms);
            if (!success) {
                p._destroy();
                onEmptyConsume.remove(consumeNode);
            }
            return success;
        },
        produce(): void {
            if (onEmptyConsume.isEmpty()) {
                ++productCnt;
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            onEmptyConsume.popFirst()!.set();
        }
    };
}
