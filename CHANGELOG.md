# Changelog

## 1.0.0

This is a fork of [promise-retry](https://npm.im/promise-retry) and the initial release differs from that package in the following ways:

 - It does not allow for swapping the function and options parameters.
 - It has a different `engines.node` setting.
 - The (untested) code allowing you to throw `EPROMISERETRY` errors from your own code was removed.
 - The main export from this module is not the promiseRetry function itself but an object with the function `promiseRetry` in it.
