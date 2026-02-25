const t = require('node:test')
const a = require('node:assert')
const { setTimeout } = require('node:timers/promises')
const { promiseRetry } = require('..')

t.suite('retry', () => {
  t.suite('timeouts', () => {
    t.test('defaults', async t => {
      await promiseRetry((retry, number, { timeouts }) => {
        a.deepEqual(timeouts, [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000])
      })
    })

    t.test('with minTimeout and randomize', async t => {
      const minTimeout = 5000
      await promiseRetry((retry, number, { timeouts }) => {
        a.equal(timeouts.length, 10)
        a.ok(timeouts[0] > minTimeout)
        const sorted = timeouts.sort((a, b) => a - b)
        a.deepEqual(timeouts, sorted)
      }, {
        minTimeout,
        randomize: true
      })
    })

    t.test('passed timeouts are copied', async t => {
      const timeoutsArray = [1000, 2000, 3000]
      await promiseRetry((retry, number, { timeouts }) => {
        a.deepEqual(timeouts, timeoutsArray)
        a.notStrictEqual(timeouts, timeoutsArray)
      }, timeoutsArray)
    })

    t.test('within boundaries', async t => {
      const minTimeout = 1000
      const maxTimeout = 10000
      await promiseRetry((retry, number, { timeouts }) => {
        for (const timeout of timeouts) {
          a.ok(timeout >= minTimeout)
          a.ok(timeout <= maxTimeout)
        }
      }, { minTimeout, maxTimeout })
    })

    t.test('incremental', async t => {
      await promiseRetry((retry, number, { timeouts }) => {
        const sorted = timeouts.sort((a, b) => a - b)
        a.deepEqual(timeouts, sorted)
      }, { retries: 5, factor: 0.5 })
    })

    t.test('incremental for factors less than one', async t => {
      await promiseRetry((retry, number, { timeouts }) => {
        const expected = [250, 500, 1000]
        a.deepEqual(expected, timeouts)
      }, {
        retries: 3,
        factor: 0.5
      })
    })

    t.test('retries', async t => {
      await promiseRetry((retry, number, { timeouts }) => {
        a.equal(timeouts.length, 2)
      }, { retries: 2 })
    })

    t.test('minTimeout > maxTimeout', async t => {
      a.rejects(
        () => promiseRetry((retry, number, { timeouts }) => {}, { minTimeout: 100, maxTimeout: 1 }),
        { message: 'minTimeout is greater than maxTimeout' }
      )
    })
  })

  t.suite('operation', () => {
    t.test('reset', async t => {
      let reset = false
      let count = 0
      const error = new Error('retrying')
      await promiseRetry(async (retry, number, operation) => {
        count += 1
        await setTimeout(10)
        if (count <= 2) {
          retry(new Error('foo'))
        }
        if (!reset) {
          operation.reset()
          reset = true
          return retry(error)
        }
        return 'final'
      }, { factor: 1, minTimeout: 100 })
      a.equal(count, 4)
    })

    t.suite('errors', () => {
      t.test('main error aggregates most frequent error', async t => {
        let mainError
        await a.rejects(() => promiseRetry(async (retry, number, operation) => {
          mainError = operation.mainError
          retry(new Error(`${number !== 1 ? 'other errors' : 'first error'}`))
        }, [1, 2, 3]))
        a.equal(mainError.message, 'other errors')
      })

      t.test('main error returns last error if none are most frequent', async t => {
        await a.rejects(() => promiseRetry(async (retry, number, operation) => {
          if (number > 1) {
            a.equal(operation.mainError.message, `error ${number}`)
          }
          retry(new Error(`Error ${number}`))
        }, [1, 2, 3, 4]))
      })

      t.test('main error null if no errors', async t => {
        const result = await promiseRetry(async (retry, number, operation) => operation.mainError)
        a.equal(result, null)
      })
    })

    t.test('retry forever does not grow errors infinitely', async t => {
      const retries = 3
      let attempts = 0
      await promiseRetry(async (retry, number, operation) => {
        attempts++
        const error = new Error(`error ${number}`)
        if (number !== 12 && retry(error)) {
          throw error
        }
        a.strictEqual(operation.attempts, number)
        a.strictEqual(operation.mainError.message, `error ${retries}`)
        a.equal(operation.errors.length, retries)
      }, { retries, forever: true, minTimeout: 1, maxTimeout: 10 })
      a.equal(attempts, 12)
    })

    t.test('retries: Infinity', async t => {
      const error = new Error('some error')
      let attempts = 0
      const result = await promiseRetry(async (retry, number, operation) => {
        attempts++
        a.equal(number, attempts)
        if (attempts !== 12 && retry(error)) {
          throw error
        }
        a.strictEqual(operation.attempts, attempts)
        a.strictEqual(operation.mainError, error)
        return `return ${attempts}`
      }, { retries: Infinity, minTimeout: 1, maxTimeout: 10 })
      a.equal(attempts, 12)
      a.equal(result, 'return 12')
    })

    t.test('forever: true, retries: null', async t => {
      const error = new Error('some error')
      const delay = 50
      let attempts = 0
      const startTime = new Date().getTime()

      await promiseRetry(async (retry, number, operation) => {
        attempts++
        a.equal(number, attempts)
        if (attempts !== 4 && retry(error)) {
          throw error
        }
        const endTime = new Date().getTime()
        const minTime = startTime + (delay * 3)
        const maxTime = minTime + 20 // add a little headroom for code execution time
        a.ok(endTime >= minTime)
        a.ok(endTime < maxTime)
        a.strictEqual(operation.attempts, attempts)
        a.strictEqual(operation.mainError, error)
        return 'last'
      }, {
        retries: null,
        forever: true,
        minTimeout: delay,
        maxTimeout: delay
      })
      a.equal(attempts, 4)
    })

    t.test('stop', async t => {
      const error = new Error('some error')
      let attempts = 0
      await a.rejects(() =>
        promiseRetry(async (retry, number, operation) => {
          attempts++
          a.equal(number, attempts)

          if (attempts === 2) {
            operation.stop()

            a.strictEqual(operation.attempts, attempts)
            a.strictEqual(operation.mainError, error)
          }
          retry(error)
        }, [1, 2, 3]))
      a.equal(attempts, 2)
    })

    t.test('maxRetryTime', async t => {
      const error = new Error('some error')
      const maxRetryTime = 30
      const startTime = new Date().getTime()
      let attempts = 0
      await a.rejects(() => promiseRetry(async (retry, number, operation) => {
        attempts++
        a.equal(number, attempts)

        if (attempts !== 2) {
          return retry(error)
        }
        const curTime = new Date().getTime()
        await setTimeout(maxRetryTime - (curTime - startTime - 1))
        a.strictEqual(operation.mainError, error)
        if (retry(new Error('error past timeout'))) {
          a.fail('timeout should have occurred')
        }
      }, {
        minTimeout: 1,
        maxRetryTime
      }), { message: 'error past timeout' })
      a.equal(attempts, 2)
    })

    t.test('unref', async t => {
      const error = new Error('some error')
      promiseRetry(async retry => {
        retry(error)
      }, { unref: true })
      a.ok('event loop not blocked')
      // If the setTimeout doesn't get unreffed tests will fail with 'Promise resolution is still pending but the event loop has already resolved'
    })
  })
})
