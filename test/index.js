const t = require('node:test')
const a = require('node:assert')
const { setTimeout } = require('node:timers/promises')

const { promiseRetry } = require('../')

t.suite('promise-retry', () => {
  t.test('should call fn again if retry was called', async t => {
    let count = 0
    const value = await promiseRetry(async retry => {
      count += 1
      await setTimeout(10)
      if (count <= 2) {
        retry(new Error('foo'))
      }
      return 'final'
    }, { factor: 1, minTimeout: 100 })
    a.equal(value, 'final')
    a.equal(count, 3)
  })

  t.test('should call fn with the number and operation', async t => {
    let count = 0
    const value = await promiseRetry(async (retry, number, operation) => {
      count += 1
      a.equal(count, number)
      a.equal(operation.attempts, count)
      await setTimeout(10)
      if (count <= 2) {
        return retry(new Error('foo'))
      }
      return 'final'
    }, { factor: 1, minTimeout: 100 })
    a.equal(value, 'final')
    a.equal(count, 3)
  })

  t.test('should not retry on fulfillment if retry was not called', async t => {
    let count = 0
    const value = await promiseRetry(async () => {
      count += 1
      await setTimeout(10)
      return 'final'
    })
    a.equal(value, 'final')
    a.equal(count, 1)
  })

  t.test('should not retry on rejection if retry was not called', async t => {
    let count = 0
    await a.rejects(
      promiseRetry(async () => {
        count += 1
        await setTimeout(10)
        throw new Error('foo')
      }),
      { message: 'foo' }
    )
    a.equal(count, 1)
  })

  t.test('should not retry on error if number of retries is 0', async t => {
    let count = 0

    await a.rejects(
      promiseRetry(async retry => {
        count += 1
        await setTimeout(10)
        retry(new Error('foo'))
      }, { retries: 0 }),
      { message: 'foo' }
    )
    a.equal(count, 1)
  })

  t.test('should reject the promise if the retries were exceeded', async t => {
    let count = 0

    await a.rejects(
      promiseRetry(async retry => {
        count += 1
        await setTimeout(10)
        retry(new Error('foo'))
      }, { retries: 2, factor: 1, minTimeout: 100 }),
      { message: 'foo' }
    )
    a.equal(count, 3)
  })

  t.test('should pass options to the underlying retry module', async t => {
    let count = 0

    await a.rejects(
      promiseRetry(async retry => {
        await setTimeout(10)
        if (count < 2) {
          count += 1
          return retry(new Error('foo'))
        }
        return 'final'
      }, { retries: 1, factor: 1, minTimeout: 100 }),
      { message: 'foo' }
    )
  })

  t.test('should convert synchronous functions into promises', async t => {
    const value = await promiseRetry(() => { return 'final' }, { factor: 1 })
    a.equal(value, 'final')
  })

  t.test('should convert synchronous throws into promises', async t => {
    await a.rejects(
      promiseRetry(() => { throw new Error('foo') }, { retries: 1, factor: 1 }),
      { message: 'foo' }
    )
  })

  t.test('should not crash on undefined rejections', async t => {
    await a.rejects(
      promiseRetry(() => {
        // eslint-disable-next-line no-throw-literal
        throw undefined
      }, { retries: 1, factor: 1 }),
      undefined
    )
    await a.rejects(
      promiseRetry((retry) => {
        retry()
      }, { retries: 1, factor: 1, minTimeout: 100 }),
      undefined
    )
  })

  t.test('should retry if retry() was called with undefined', async t => {
    let count = 0

    const value = await promiseRetry(
      async retry => {
        count += 1
        await setTimeout(10)

        if (count <= 2) {
          return retry()
        }
        return 'final'
      }, { factor: 1, minTimeout: 100 })
    a.equal(value, 'final')
    a.equal(count, 3)
  })

  t.test('should work with several retries in the same chain', async t => {
    let count = 0

    await a.rejects(
      promiseRetry(async retry => {
        count += 1

        await setTimeout(10)
        retry(new Error('foo'))
      }, { retries: 1, factor: 1, minTimeout: 100 }),
      { message: 'foo' }
    )
    a.equal(count, 2)
  })
})
