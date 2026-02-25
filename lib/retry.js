class RetryOperation {
  #attempts = 1
  #cachedTimeouts = null
  #errors = []
  #fn = null
  #maxRetryTime = Infinity
  #operationStart = null
  #options
  #originalTimeouts
  #timeouts
  #timer = null

  constructor (timeouts, options = {}) {
    this.#options = options
    this.#originalTimeouts = [...timeouts]
    this.#timeouts = [...timeouts]

    if (this.#options.maxRetryTime) {
      this.#maxRetryTime = this.#options.maxRetryTime
    }
    if (this.#options.forever) {
      this.#cachedTimeouts = [...this.#timeouts]
    }
  }

  get timeouts () {
    return [...this.#timeouts]
  }

  get errors () {
    return this.#errors
  }

  get attempts () {
    return this.#attempts
  }

  get mainError () {
    if (this.#errors.length === 0) {
      return null
    }

    const counts = {}
    let mainError = null
    let mainErrorCount = 0

    for (let i = 0; i < this.#errors.length; i++) {
      const error = this.#errors[i]
      const message = error.message
      if (!counts[message]) {
        counts[message] = 0
      }
      counts[message]++

      if (counts[message] >= mainErrorCount) {
        mainError = error
        mainErrorCount = counts[message]
      }
    }

    return mainError
  }

  reset () {
    this.#attempts = 1
    this.#timeouts = [...this.#originalTimeouts]
  }

  stop () {
    if (this.#timer) {
      clearTimeout(this.#timer)
    }

    this.#timeouts = []
    this.#cachedTimeouts = null
  }

  retry (err) {
    this.#errors.push(err)
    if (new Date().getTime() - this.#operationStart >= this.#maxRetryTime) {
      this.#errors.unshift(new Error('RetryOperation timeout occurred'))
      return false
    }

    let timeout = this.#timeouts.shift()
    if (timeout === undefined) {
      // We're out of timeouts, clear the last error and repeat the last timeout
      if (this.#cachedTimeouts) {
        this.#errors.pop()
        timeout = this.#cachedTimeouts.at(-1)
      } else {
        return false
      }
    }

    this.#timer = setTimeout(() => {
      this.#attempts++
      this.#fn(this.#attempts)
    }, timeout)

    if (this.#options.unref) {
      this.#timer.unref()
    }

    return true
  }

  attempt (fn) {
    this.#fn = fn
    this.#operationStart = new Date().getTime()
    this.#fn(this.#attempts)
  }
}

const createTimeout = (attempt, opts) => {
  let random = 1
  if (opts.randomize) {
    random += Math.random()
  }

  return Math.min(Math.round(random * Math.max(opts.minTimeout, 1) * Math.pow(opts.factor, attempt)), opts.maxTimeout)
}

const timeouts = options => {
  if (options instanceof Array) {
    return [...options]
  }

  const opts = {
    retries: 10,
    factor: 2,
    minTimeout: 1 * 1000,
    maxTimeout: Infinity,
    randomize: false,
    ...options
  }

  if (opts.minTimeout > opts.maxTimeout) {
    throw new Error('minTimeout is greater than maxTimeout')
  }

  if (opts.retries) {
    const timeouts = []
    for (let i = 0; i < opts.retries; i++) {
      timeouts.push(createTimeout(i, opts))
    }
    // sort the array numerically ascending (since the createTimeout is randomized)
    timeouts.sort((a, b) => a - b)
    return timeouts
  }
  if (options?.forever) {
    return [createTimeout(0, opts)]
  }
  return []
}

exports.operation = function (options = {}) {
  if (options.retries === Infinity) {
    options.forever = true
    delete options.retries
  }
  return new RetryOperation(timeouts(options), {
    forever: options.forever,
    unref: options.unref,
    maxRetryTime: options.maxRetryTime
  })
}
