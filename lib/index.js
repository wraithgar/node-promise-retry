const retry = require('retry')

function isRetryError (err) {
  return err?.code === 'EPROMISERETRY' && Object.hasOwn(err, 'retried')
}

async function promiseRetry (fn, options = {}) {
  const operation = retry.operation(options)

  return new Promise(function (resolve, reject) {
    operation.attempt(async number => {
      try {
        const result = await fn(err => {
          // TODO this is never hit in tests and it may not actually need to exist
          /* node:coverage ignore next 3 */
          if (isRetryError(err)) {
            err = err.retried
          }

          throw Object.assign(new Error('Retrying'), { code: 'EPROMISERETRY', retried: err })
        }, number)
        return resolve(result)
      } catch (err) {
        if (isRetryError(err)) {
          if (operation.retry(err.retried || new Error())) {
            return
          }
          return reject(err.retried)
        }
        return reject(err)
      }
    })
  })
}

module.exports = promiseRetry
