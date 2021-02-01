# EVENT-WAIT OBJECT


>`createWaitEventObject()`:

This is one of the simplest mechanisms for communication between event loop execution contexts: 

* one context signals an event with `set()` and other events in event loop that `wait(ms_timeout?)` for it will be resolved immediately when their context is available.
    * If timeout is reached, the state of the event object will not be changed (false will be returned). Only `set()` releases the wait lock.
    * Calling `set()` will release all a`wait()`ing objects. For a queue behavior, look at `createConsumerProducerEventObject` implementation.
    * Calling `clear()` will reset the `set()` and `wait()` will await until `set()` is called again.

> `createConsumerProducerEventObject(number of initial products)`:

The typical programming style using condition variables uses the lock via promises to synchronize access to some shared state. 
The different events in event loop that are interested in a particular change of state call `consume()` and wait until they see the desired state, while contexts that modify the state call `produce()`.
For each `produce()` only one `consume()` will be released - where in  `createWaitEventObject` for one `set()`, all `wait()`s were released.

* calling `consume(ms_timeout?)` will wait until there is a product produced (via `produce()`) OR timeout is reached (if specified). 

    * consumers are stored in a queue, so the first one to `consume()` will be the first one to release when `produce()` is called.

    * If timeout is reached, the product (counter) will not be consumed (false will be returned). And the consumer will be removed from the queue. So the next time it'll call `consume()`, it will go to the back of the queue.

#
There is no polling implemented for promises that wait for the set signal. The context goes into background and is awoken via internal EventEmitter that resolves its promise.

----

Documentation by example:

```javascript
async function wait_event_example1() {
    // Straight-forward example.
    const log = (txt) => console.log(txt, new Date().toISOString())
    const assert = require('assert')
    const { createWaitEventObject } = require('event-wait')

    const flag = createWaitEventObject()

    /*
        * flag.wait() awaits until flag.set() is called.
        * returns true if timeout parameter (in milliseconds) was not sent into flag.wait(ms) otherwise it yields false
    */

    // set flag in 3 seconds.
    setTimeout(() => flag.set(), 3000)

    log('waiting for flag to be set (in 3 seconds).')
    assert(await flag.wait() === true)
    log('flag was set!')

    log('will immediately continue because flag was set.')
    assert(await flag.wait() === true)

    // clear the flag for reuse (can be set again)
    flag.clear()
    log('will wait 5 seconds for flag to be set (it wont be) - timeout will happen')
    assert(await flag.wait(5000) === false)

    log('will wait because flag was not set (timed out), but it will be set in 2 seconds now.')
    setTimeout(() => flag.set(), 2000)
    assert(await flag.wait() === true)
    log('done.')
}

async function wait_event_example2() {
    // example unblock / block the waiting streamers
    const log = (txt) => console.log(txt, new Date().toISOString())
    const { createWaitEventObject } = require('event-wait')

    const flag = createWaitEventObject()

    const streamers = 5
    for (let i = 0; i < streamers; i++) {
        setTimeout(async () => {
            log(`Streamer ${i} is waiting for wait() to be set()`)
            await flag.wait()
            log(`Streamer ${i} released!`)
        })
    }

    log('Releasing streamers in 3 seconds')
    setTimeout(() => flag.set(), 3000)
}

async function wait_event_example3() {
    // example unblock / block the waiting streamers on repeat
    const log = (txt) => console.log(txt, new Date().toISOString())
    const { createWaitEventObject } = require('event-wait')

    const flag = createWaitEventObject()

    const streamers = 5
    for (let i = 0; i < streamers; i++) {
        setTimeout(async () => {
            while (true) {
                log(`Streamer ${i} is waiting for wait() to be set()`)
                await flag.wait()
                log(`Streamer ${i} released!`)
            }
        })
    }

    log('Releasing streamers every 3 seconds')
    setInterval(() => {
        // release and then immediately block them
        flag.set()
        flag.clear()
    }, 3000)
}

async function consumer_producer_example1() {
    // Straight-forward example.
    const log = (txt) => console.log(txt, new Date().toISOString())
    const assert = require('assert')
    const { createConsumerProducerEventObject } = require('event-wait')

    /*
        * produce() signals that a resource is available
        * the first awaited consume() will receive the signal immediately and yield true (taking the resource)
        * consume() will not be awaited if there are products available.
        * if timeout (in milliseconds) is given to consume() as parameter, it will yield false if it didn't manage to take the product.
    */

    // produce 2 products (or pass 2 as argument to createConsumerProducerEventObject)
    const factory = createConsumerProducerEventObject()
    factory.produce()
    factory.produce()
    setTimeout(() => factory.produce(), 5000)
    log('Start consuming')
    assert(await factory.consume() === true)
    log('1 - consume')
    assert(await factory.consume() === true)
    log('2 - and factory is empty. Will wait 5 seconds for it to produce.')
    assert(await factory.consume() === true)
    log('3 - now i will time-out in 3 seconds (returns false on timeout). Because factory will not produce anything')
    assert(await factory.consume(3000) === false)
    setTimeout(() => factory.produce(), 1000)
    log('Factory will produce in 1 seconds (before given 3 seconds timeout)')
    assert(await factory.consume(3000) === true)
    log('done')
}

async function consumer_producer_example2() {
    // More "real-world" example
    const log = (txt) => console.log(txt, new Date().toISOString())
    const { createConsumerProducerEventObject } = require('event-wait')

    // create factory with 1 product already produced.
    const factory = createConsumerProducerEventObject(1)
    const consumers = 3
    // spawn consumers
    for (let i = 0; i < consumers; i++)
        setTimeout(async () => {
            while (true) {
                log(`Consumer ${i} is waiting for resource.`)
                await factory.consume()
                log(`Consumer ${i} took the resource!`)
            }
        }, 0)

    // while consume is awaited other tasks can run.
    setInterval(() => { console.log('\n~consume is nonblocking! yaay~\n') }, 500)

    // produce new product every two seconds.
    setInterval(() => { log('produce!'); factory.produce() }, 2000)


    // create consumer that tries to consume product for 500ms and if fails, it will retry with double of that time, and continue to do that until given enough time to get the resource
    setTimeout(async () => {
        let waitForMs = 500
        while (true) {
            log('Impatient Consumer gives factory some time to produce...')
            if (await factory.consume(waitForMs)) {
                log('\n!!Impatient Consumer got what he wanted!!')
                break
            } else {
                waitForMs *= 2
                log('Impatient Consumer did not get what he wanted and will continue to be impatient :)')
            }
        }
    })
}

async function wait_all_background_tasks() {
    /*
        Run multiple async background tasks, and wait for them to finish.
    */
    const log = (txt) => console.log(txt, new Date().toISOString())
    const { createWaitEventObject } = require('event-wait')

    const backgroundTasks = 10
    const backgroundFlags = new Array(backgroundTasks).fill().map(() => createWaitEventObject())
    const sleepMs = ms => new Promise(r => setTimeout(r, ms))

    for (let i = 0; i < backgroundTasks; i++) {
        setTimeout(async () => {
            log('Running background task ' + i)
            await sleepMs(Math.random() * 10e3)
            log('Running background task ' + i + ' completed!')
            backgroundFlags[i].set()
        }, 0)
    }

    log('Waiting for all background tasks....')
    await Promise.all(backgroundFlags.map(f => f.wait()))
    log('All background tasks completed')
}

function web_server_example() {
    /*
        Use-case example on webserver using express:  
        1. Throttle requests only one (or more - change maxConcurrentRequests) request at a time and timeout if the queue is waiting too long.
        2. After 10 visits on specific endpoint (/ root), immediate release waiting processes 
           - currently they only change text, which is trivial - but suits as an example for some other background tasks waiting to be executed.
    */

    const express = require('express')
    const {
        createConsumerProducerEventObject,
        createWaitEventObject
    } = require('event-wait')

    const app = express()
    let visits = 0
    const visitsT = 10
    const flagVisitsEvent = createWaitEventObject()
    const maxConcurrentRequests = 1
    const throttler = createConsumerProducerEventObject(maxConcurrentRequests)
    let txt = `This is a secret text for first ${visitsT} users.`

    function limitRequests(reqHandlerFn) {
        return async function (req, res, next) {
            if (flagVisitsEvent.isSet()) {
                await reqHandlerFn(req, res, next)
                return
            }

            let timeout = false
            try {
                const timeoutMsMaxWait = 10000
                if (!await throttler.consume(timeoutMsMaxWait)) {
                    res.status(408).send('Server too busy.').end()
                    timeout = true
                    return
                }
                await reqHandlerFn(req, res, next)
            } finally {
                // release the resource if request was processed.
                // if timeout happened the item was not consumed so we don't need to produce a new one.
                if (!timeout) {
                    throttler.produce()
                }
            }
        }
    }

    app.get('/', limitRequests(async function (req, res) {
        if (++visits > visitsT - 1) {
            flagVisitsEvent.set()
        }
        // sleep - as to delay request to simulate a "heavy" endpoint.
        await new Promise(r => setTimeout(r, 5000))
        res.send(txt + ' ' + visits).end()
    }))

    for (let i = 0; i < 10; i++) {
        setTimeout(async () => {
            await flagVisitsEvent.wait()
            txt = `[confidential]-${i}`
            console.log('process', i, txt)
        })
    }

    app.listen(3000)
}
```


