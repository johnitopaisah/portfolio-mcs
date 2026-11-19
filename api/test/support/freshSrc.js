'use strict';
// Database suites point DATABASE_URL at their own throw-away database. Modules
// under src/ capture the pg pool when first required, so a suite that runs
// after another one must reload them, or it queries the previous suite's
// (already closed) database. metrics.js stays cached: prom-client's registry is
// global and refuses duplicate metric names.
const path = require('path');

const SRC = path.resolve(__dirname, '../../src') + path.sep;

module.exports = function freshSrc() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(SRC) && k !== path.join(SRC, 'metrics.js')) delete require.cache[k];
  }
};
