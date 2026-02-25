class RetryOperation {
  #attempts = 1
  #cachedTimeouts = null
  #errors = []
  #fn = null
  #maxRetryTime
  #operationStart = null
  #originalTimeouts
  #timeouts
  #timer = null
  #unref

  constructor (timeouts, options = {}) {
    this.#originalTimeouts = [...timeouts]
    this.#timeouts = [...timeouts]
    this.#unref = options.unref
    this.#maxRetryTime = options.maxRetryTime || Infinity
    if (options.forever) {
      this.#cachedTimeouts = [...this.#timeouts]
    }
  }

  get timeouts () {
    return [...this.#timeouts]
  }

  get errors () {
    return [...this.#errors]
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

    if (this.#unref) {
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
module.exports = { RetryOperation }
