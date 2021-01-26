interface INode<T> {
    value: T;
    prev: INode<T> | null;
    next: INode<T> | null;
}

function appendNode<T>(node: INode<T>, next: INode<T>): INode<T> {
    node.next = next;
    next.prev = node;
    return next;
}

function createNode<T>(value: T): INode<T> {
    return {
        value,
        prev: null,
        next: null
    };
}

export class NodeContainer<T>{
    private tail: INode<T>;
    private readonly head: INode<T>;
    constructor() {
        this.head = createNode<T>(null as unknown as T);
        this.tail = this.head;
    }
    push(value: T): INode<T> {
        return this.tail = appendNode(this.tail, createNode(value));
    }
    remove(node: INode<T>): T {
        const { prev, next } = node;
        if (!prev) {
            throw 'cannot remove root head node.';
        }
        if (node === this.tail) {
            this.tail = prev;
        }
        prev.next = next;
        if (next) next.prev = prev;
        node.next = node.prev = null;
        return node.value;
    }
    isEmpty(): boolean {
        return this.head === this.tail;
    }
    popFirst(): null | T {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.isEmpty() ? null : this.remove(this.head.next!);
    }
}
