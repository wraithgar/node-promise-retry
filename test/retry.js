const t = require('node:test')
const a = require('node:assert')

const retry = require('../lib/retry')

t.suite('retry', () => {
  t.suite('timeouts', () => {
    t.test('defaults', t => {
      const { timeouts } = retry.operation()
      a.deepEqual(timeouts, [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000])
    })

    t.test('with minTimeout and randomize', t => {
      const minTimeout = 5000
      const { timeouts } = retry.operation({
        minTimeout,
        randomize: true
      })

      a.equal(timeouts.length, 10)
      a.ok(timeouts[0] > minTimeout)
      const sorted = timeouts.sort((a, b) => a - b)
      a.deepEqual(timeouts, sorted)
    })

    t.test('passed timeouts are copied', t => {
      const timeoutsArray = [1000, 2000, 3000]
      const { timeouts } = retry.operation(timeoutsArray)
      a.deepEqual(timeouts, timeoutsArray)
      a.notStrictEqual(timeouts, timeoutsArray)
    })

    t.test('within boundaries', t => {
      const minTimeout = 1000
      const maxTimeout = 10000
      const { timeouts } = retry.operation({ minTimeout, maxTimeout })
      for (const timeout of timeouts) {
        a.ok(timeout >= minTimeout)
        a.ok(timeout <= maxTimeout)
      }
    })

    t.test('incremental', t => {
      // TODO defaults are already tested in whole
      const { timeouts } = retry.operation()
      const sorted = timeouts.sort((a, b) => a - b)
      a.deepEqual(timeouts, sorted)
    })

    t.test('incremental for factors less than one', t => {
      const { timeouts } = retry.operation({
        retries: 3,
        factor: 0.5
      })

      const expected = [250, 500, 1000]
      a.deepEqual(expected, timeouts)
    })

    t.test('retries', t => {
      const { timeouts } = retry.operation({ retries: 2 })
      a.equal(timeouts.length, 2)
    })

    t.test('minTimeout > maxTimeout', t => {
      a.throws(() => {
        retry.operation({ minTimeout: 100, maxTimeout: 1 })
      }, { message: 'minTimeout is greater than maxTimeout' }
      )
    })
  })

  t.suite('operation', () => {
    t.test('reset', (t, done) => {
      const error = new Error('some error')
      const operation = retry.operation([1, 2, 3])
      let attempts = 0

      let expectedFinishes = 1
      let finishes = 0

      const fn = function () {
        operation.attempt(function (currentAttempt) {
          attempts++
          a.equal(currentAttempt, attempts)
          if (operation.retry(error)) {
            return
          }

          finishes++
          a.equal(expectedFinishes, finishes)
          a.strictEqual(attempts, 4)
          a.strictEqual(operation.attempts, attempts)
          a.strictEqual(operation.mainError, error)

          if (finishes < 2) {
            attempts = 0
            expectedFinishes++
            operation.reset()
            fn()
          } else {
            done()
          }
        })
      }
      fn()
    })

    t.suite('errors', () => {
      t.test('main error returns most frequent error', (t, done) => {
        const operation = retry.operation([1, 2, 3])
        let attempts = 0
        operation.attempt(function (currentAttempt) {
          attempts++
          if (!operation.retry(new Error(`${attempts ? 'other errors' : 'first error'}`))) {
            a.strictEqual(attempts, 4)
            a.strictEqual(operation.attempts, attempts)
            a.deepStrictEqual(operation.mainError, new Error('other errors'))
            done()
          }
        })
      })

      t.test('main error returns last error', (t, done) => {
        const operation = retry.operation([1, 2, 3])
        let attempts = 0
        operation.attempt(function (currentAttempt) {
          attempts++
          if (!operation.retry(new Error(`Error ${attempts}`))) {
            a.strictEqual(attempts, 4)
            a.strictEqual(operation.attempts, attempts)
            a.deepStrictEqual(operation.mainError, new Error('Error 4'))
            a.deepStrictEqual(operation.errors, [
              new Error('Error 1'),
              new Error('Error 2'),
              new Error('Error 3'),
              new Error('Error 4')
            ])
            done()
          }
        })
      })

      t.test('main error null if no errors', t => {
        const operation = retry.operation()
        operation.attempt(function () {
          return true
        })
        a.equal(operation.mainError, null)
      })
    })

    t.test('retry', (t, done) => {
      const error = new Error('some error')
      const operation = retry.operation([1, 2, 3])
      let attempts = 0

      operation.attempt(function (currentAttempt) {
        attempts++
        a.equal(currentAttempt, attempts)
        if (!operation.retry(error)) {
          a.strictEqual(attempts, 4)
          a.strictEqual(operation.attempts, attempts)
          a.strictEqual(operation.mainError, error)
          done()
        }
      })
    })

    t.test('retry forever', (t, done) => {
      const error = new Error('some error')
      const operation = retry.operation({ retries: 3, forever: true, minTimeout: 1, maxTimeout: 10 })
      let attempts = 0

      operation.attempt(function (currentAttempt) {
        attempts++
        a.equal(currentAttempt, attempts)
        if (attempts !== 6 && operation.retry(error)) {
          return
        }

        a.strictEqual(attempts, 6)
        a.strictEqual(operation.attempts, attempts)
        a.strictEqual(operation.mainError, error)
        done()
      })
    })

    t.test('retry forever no retries', (t, done) => {
      const error = new Error('some error')
      const delay = 50
      const operation = retry.operation({
        retries: null,
        forever: true,
        minTimeout: delay,
        maxTimeout: delay
      })

      let attempts = 0
      const startTime = new Date().getTime()

      operation.attempt(function (currentAttempt) {
        attempts++
        a.equal(currentAttempt, attempts)
        if (attempts !== 4 && operation.retry(error)) {
          return
        }

        const endTime = new Date().getTime()
        const minTime = startTime + (delay * 3)
        const maxTime = minTime + 20 // add a little headroom for code execution time
        a.ok(endTime >= minTime)
        a.ok(endTime < maxTime)
        a.strictEqual(attempts, 4)
        a.strictEqual(operation.attempts, attempts)
        a.strictEqual(operation.mainError, error)
        done()
      })
    })

    t.test('stop', (t, done) => {
      const error = new Error('some error')
      const operation = retry.operation([1, 2, 3])
      let attempts = 0

      operation.attempt(function (currentAttempt) {
        attempts++
        a.equal(currentAttempt, attempts)

        if (attempts === 2) {
          operation.stop()

          a.strictEqual(attempts, 2)
          a.strictEqual(operation.attempts, attempts)
          a.strictEqual(operation.mainError, error)
          done()
        }

        operation.retry(error)
      })
    })

    t.test('maxRetryTime', (t, done) => {
      const error = new Error('some error')
      const maxRetryTime = 30
      const operation = retry.operation({
        minTimeout: 1,
        maxRetryTime
      })
      let attempts = 0

      const longAsyncFunction = function (wait, callback) {
        setTimeout(callback, wait)
      }

      const startTime = new Date().getTime()
      operation.attempt(function (currentAttempt) {
        attempts++
        a.equal(currentAttempt, attempts)

        if (attempts !== 2) {
          operation.retry(error)
        } else {
          const curTime = new Date().getTime()
          longAsyncFunction(maxRetryTime - (curTime - startTime - 1), function () {
            if (operation.retry(error)) {
              a.fail('timeout should be occurred')
              return
            }

            a.strictEqual(operation.mainError, error)
            done()
          })
        }
      })
    })

    t.test('errors preserved when maxRetryTime exceeded', (t, done) => {
      const error = new Error('some error')
      const maxRetryTime = 30
      const operation = retry.operation({
        minTimeout: 1,
        maxRetryTime
      })

      const longAsyncFunction = function (wait, callback) {
        setTimeout(callback, wait)
      }

      const startTime = new Date().getTime()
      operation.attempt(function () {
        const curTime = new Date().getTime()
        longAsyncFunction(maxRetryTime - (curTime - startTime - 1), function () {
          if (operation.retry(error)) {
            a.fail('timeout should occur')
            return
          }

          a.strictEqual(operation.mainError, error)
          done()
        })
      })
    })

    t.test('unref', t => {
      const error = new Error('some error')
      const operation = retry.operation({ unref: true })
      operation.attempt(function () {
        operation.retry(error)
      })
      a.ok('event loop not blocked')
    })
  })
})
