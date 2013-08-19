/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  "use strict";

  window.BrowserID = window.BrowserID || {};

  var bid = window.BrowserID, constants = {
    // always use 1024/160 DSA keys - see issue #1293
    // this used to be called keysize 128, but that made
    // no sense since no component of this is 128 bits
    // so making this 160 as per DSA 1024/160
    // EXCEPT, for backwards compatibility this is still 128 for now
    KEY_LENGTH: 128,

    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 80,

    // IE8 has a max total URL length of 2083 and a max path length of 2048.
    // http://support.microsoft.com/kb/q208427
    // See issue #2080 - https://github.com/mozilla/browserid/issues/2080
    URL_MAX_LENGTH: 2083,
    PATH_MAX_LENGTH: 2048,

    // XHR requests are considered delayed after 10 seconds.
    XHR_DELAY_MS: 10 * 1000
  };

  for (var key in constants) {
    bid[key] = constants[key];
  }
}());
