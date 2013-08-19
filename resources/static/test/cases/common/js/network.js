/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
(function() {
  "use strict";

  var bid = BrowserID,
      mediator = bid.Mediator,
      transport = bid.Mocks.xhr,
      user = bid.User,
      network = bid.Network,
      testHelpers = bid.TestHelpers,
      TEST_EMAIL = "testuser@testuser.com",
      TEST_PASSWORD = "password",
      failureCheck = testHelpers.failureCheck,
      testObjectValuesEqual = testHelpers.testObjectValuesEqual;


  module("common/js/network", {
    setup: function() {
      testHelpers.setup();
    },
    teardown: function() {
      testHelpers.teardown();
    }
  });

  /*
   * The staging functions are generic and can be tested using equally generic
   * test functions. First, create a list of staging functions and whether the
   * staging function takes a password or not. Then create a list of tests to
   * run. Run each test for each method.
   */
  var stagingMethods = {
    createUser: {
      password: true,
      unverified: true
    },
    addSecondaryEmail: {
      password: true
    },
    requestPasswordReset: {
      password: false
    },
    requestEmailReverify: {
      password: false
    },
    requestTransitionToSecondary: {
      password: true
    }
  };

  function getStagingMethodArgs(email, onComplete, config, onFailure) {
    var args = [email];

    if (config.password) {
      args.push("password");
    }

    args.push("origin");

    if (config.unverified) {
      args.push(false);
    }

    args.push(onComplete, onFailure || testHelpers.unexpectedFailure);
    return args;
  }

  var stagingTests = {
    testStagingMethodSuccess: function(stagingMethod, config) {
      asyncTest(stagingMethod + " success", function() {
        var onComplete = function(status) {
          equal(status.success, true, stagingMethod + " request success");
          start();
        };

        network[stagingMethod].apply(network,
            getStagingMethodArgs(TEST_EMAIL, onComplete, config));
      });
    },

    testStagingMethodInvalid: function(stagingMethod, config) {
      asyncTest(stagingMethod + " invalid", function() {
        transport.useResult("invalid");
        var onComplete = function(status) {
          equal(status, false);
          start();
        };

        network[stagingMethod].apply(network, getStagingMethodArgs("invaliduser", onComplete, config));
      });
    },

    testStagingMethodThrottled: function(stagingMethod, config) {
      asyncTest(stagingMethod + " throttled", function() {
        transport.useResult("throttle");

        var onComplete = function(status) {
          equal(status, false, "throttled email calls onSuccess but with false as the value");
          start();
        };

        network[stagingMethod].apply(network, getStagingMethodArgs(TEST_EMAIL, onComplete, config));
      });
    },

    testStagingMethodFailure: function(stagingMethod, config) {
      asyncTest(stagingMethod + " XHR failure", function() {
        transport.useResult("ajaxError");
        network[stagingMethod].apply(network,
            getStagingMethodArgs(TEST_EMAIL, testHelpers.unexpectedSuccess,
                config, testHelpers.expectedFailure));
      });
    }
  };

  for(var stagingMethod in stagingMethods) {
    var config = stagingMethods[stagingMethod];

    for( var stagingTest in stagingTests) {
      stagingTests[stagingTest](stagingMethod, config);
    }
  }


  /*
   * The verification methods complete some sort of registration. They are
   * generic and can be generically tested.
   */
  var verificationMethods = {
    completeUserRegistration: true,
    completeEmailRegistration: true,
    completePasswordReset: true,
    completeTransitionToSecondary: true
  };


  var verificationTests = {
    verificationSuccess: function(verificationMethod) {
      asyncTest(verificationMethod + " with valid token, no password required", function() {
        network[verificationMethod]("token", null, function(registered) {
          var req = transport.getLastRequest();
          var data = JSON.parse(req.data);
          equal("pass" in data, false, "password not sent in request if not needed");

          ok(registered.success);
          start();
        }, testHelpers.unexpectedFailure);
      });
    },

    verificationBadPassword: function(verificationMethod) {
      asyncTest(verificationMethod + " with valid token, bad password", function() {
        transport.useResult("badPassword");
        network[verificationMethod]("token", "password",
          testHelpers.unexpectedSuccess,
          testHelpers.expectedXHRFailure);
      });
    },
    verificationPasswordRequired: function(verificationMethod) {
      asyncTest(verificationMethod + " with valid token, password required", function() {
        network[verificationMethod]("token", "password", function(registered) {
          ok(registered.success);
          start();
        }, testHelpers.unexpectedFailure);
      });
    },
    verificationInvalidToken: function(verificationMethod) {
      asyncTest(verificationMethod + " with invalid token", function() {
        transport.useResult("invalid");

        network[verificationMethod]("token", "password", function(registered) {
          equal(registered.success, false);
          start();
        }, testHelpers.unexpectedFailure);
      });
    },
    verificationXHRFailure: function(verificationMethod) {
      asyncTest(verificationMethod + " with XHR failure", function() {
        failureCheck(network[verificationMethod], "token", "password");
      });
    }
  };

  for(var verificationMethod in verificationMethods) {
    var usePassword = verificationMethods[verificationMethod];
    for( var verificationTest in verificationTests) {
      verificationTests[verificationTest](verificationMethod, usePassword);
    }
  }

  /*
   * The registration status check methods are generic and can be
   * generically tested.
   */
  var checkingMethods = {
    checkUserRegistration: true,
    checkEmailRegistration: true,
    checkPasswordReset: true,
    checkEmailReverify: true,
    checkTransitionToSecondary: true
  };

  var checkingTests = {
    pending: function(checkMethod) {
      asyncTest(checkMethod + " pending", function() {
        transport.useResult("pending");

        network[checkMethod]("registered@testuser.com", function(status) {
          equal(status.status, "pending");
          start();
        }, testHelpers.unexpectedFailure);
      });
    },

    mustAuth: function(checkMethod) {
      asyncTest(checkMethod + " mustAuth", function() {
        transport.useResult("mustAuth");

        user.checkAuthentication(function(auth_status) {
          equal(!!auth_status, false, "user not yet authenticated");
          network[checkMethod]("registered@testuser.com", function(status) {
            equal(status.status, "mustAuth");
            user.checkAuthentication(function(auth_status) {
              equal(!!auth_status, false, "user not yet authenticated");
              start();
            }, testHelpers.unexpectedFailure);
          }, testHelpers.unexpectedFailure);
        }, testHelpers.unexpectedFailure);
      });
    },

    complete: function(checkMethod) {
      asyncTest(checkMethod + " complete", function() {
        network.withContext(function() {
          transport.useResult("complete");
          network[checkMethod]("registered@testuser.com", function(status) {
            equal(status.status, "complete");
            start();
          }, testHelpers.unexpectedFailure);
        });
      });
    },

    xhrFailure: function(checkMethod) {
      asyncTest(checkMethod + " with XHR failure", function() {
        failureCheck(network[checkMethod], "registered@testuser.com");
      });
    }
  };

  for(var checkingMethod in checkingMethods) {
    var usePassword = checkingMethods[checkingMethod];
    for( var checkingTest in checkingTests) {
      checkingTests[checkingTest](checkingMethod, usePassword);
    }
  }


  asyncTest("authenticate with valid user", function() {
    network.authenticate(TEST_EMAIL, "testuser", false, function(status) {
      equal(status.success, true, "valid authentication");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("authenticate with invalid user", function() {
    transport.useResult("invalid");
    network.authenticate(TEST_EMAIL, "invalid", false, function(status) {
      equal(status.success, false, "invalid authentication");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("authenticate with XHR failure after context already setup", function() {
    failureCheck(network.authenticate, TEST_EMAIL, false, "ajaxError");
  });

  asyncTest("authenticateWithAssertion with valid email/assertioni, returns true status", function() {
    network.authenticateWithAssertion(TEST_EMAIL, "test_assertion",
        function(status) {
      equal(status.success, true, "user authenticated, status set to true");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("authenticateWithAssertion with invalid email/assertion", function() {
    transport.useResult("invalid");

    network.authenticateWithAssertion(TEST_EMAIL, "test_assertion",
        function(status) {
      equal(status.success, false, "user not authenticated, status set to false");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("authenticateWithAssertion with XHR failure", function() {
    failureCheck(network.authenticateWithAssertion, TEST_EMAIL,
        "test_assertion");
  });

  asyncTest("logout", function() {
    network.logout(function onSuccess() {
      ok(true, "we can logout");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });


  asyncTest("logout with 400 failure - user already logged out", function() {
    transport.useResult("not_authenticated");

    network.logout(function onSuccess() {
      ok(true, "we can logout");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("logout with XHR failure", function() {
    failureCheck(401, network.logout);
  });


  asyncTest("cancelUser valid", function() {

    network.cancelUser(function() {
      // XXX need a test here.
      ok(true);
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("cancelUser invalid", function() {
    transport.useResult("invalid");

    network.cancelUser(function() {
      // XXX need a test here.
      ok(true);
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("cancelUser with XHR failure", function() {
    failureCheck(network.cancelUser);
  });

  asyncTest("emailRegistered with taken email", function() {
    network.emailRegistered("registered@testuser.com", function(taken) {
      equal(taken, true, "a taken email is marked taken");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("emailRegistered with nottaken email", function() {
    network.emailRegistered("unregistered@testuser.com", function(taken) {
      equal(taken, false, "a not taken email is not marked taken");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("emailRegistered with XHR failure", function() {
    failureCheck(network.emailRegistered, "registered@testuser.com");
  });



  asyncTest("addEmailWithAssertion, user not authenticated or invalid assertion, returns false status", function() {
    transport.useResult("invalid");

    network.addEmailWithAssertion("test_assertion", function(status) {
      equal(status, false, "email not added, status set to false");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addEmailWithAssertion valid asserton, returns true status", function() {
    network.addEmailWithAssertion("test_assertion", function(status) {
      equal(status, true, "email added, status set to true");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addEmailWithAssertion with XHR failure", function() {
    failureCheck(network.addEmailWithAssertion, "test_assertion");
  });


  asyncTest("emailForVerificationToken with XHR failure", function() {
    failureCheck(network.emailForVerificationToken, "token");
  });

  asyncTest("emailForVerificationToken with invalid token - returns null result", function() {
    transport.useResult("invalid");

    network.emailForVerificationToken("token", function(result) {
      equal(result, null, "invalid token returns null result");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("emailForVerificationToken that must authenticate - returns must_auth and email address", function() {
    transport.useResult("mustAuth");

    network.emailForVerificationToken("token", function(result) {
      testObjectValuesEqual(result, { must_auth: true, email: TEST_EMAIL });
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("emailForVerificationToken that does not need password", function() {
    network.emailForVerificationToken("token", function(result) {
      equal(result.needs_password, false, "needs_password correctly set to false");
      equal(result.email, TEST_EMAIL, "email address correctly added");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("removeEmail valid", function() {
    network.removeEmail("validemail", function onSuccess() {
      // XXX need a test here;
      ok(true);
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("removeEmail invalid", function() {
    transport.useResult("invalid");

    network.removeEmail("invalidemail", function onSuccess() {
      // XXX need a test here;
      ok(true);
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("removeEmail with XHR failure", function() {
    failureCheck(network.removeEmail, "invalidemail");
  });


  asyncTest("serverTime", function() {
    // Pretend the local clock is 1.25 seconds ahead of the server clock.
    var LOCAL_SKEW = 1250;
    transport.setContextInfo("server_time", new Date().getTime() - LOCAL_SKEW);

    network.serverTime(function(time) {
      // Allow 100 ms for all of the onContextChagne handlers to complete
      var MAX_ALLOWED_TIME_DIFF = LOCAL_SKEW + 100;
      var diff = Math.abs((new Date()) - time);

      ok(diff < MAX_ALLOWED_TIME_DIFF, "server time and local time should be less than " + MAX_ALLOWED_TIME_DIFF + "ms different (is " + diff + "ms different)");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("serverTime with XHR failure before context has been setup", function() {
    transport.useResult("contextAjaxError");

    failureCheck(network.serverTime);
  });

  asyncTest("codeVersion", function() {
    network.codeVersion(function onComplete(version) {
      equal(version, "ABC123", "version returned properly");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("codeVersion with XHR failure", function() {
    transport.useResult("contextAjaxError");

    failureCheck(network.codeVersion);
  });

  asyncTest("addressInfo with unknown secondary email", function() {
    transport.useResult("unknown_secondary");
    network.addressInfo(TEST_EMAIL, 'default', function onComplete(data) {
      equal(data.type, "secondary", "type is secondary");
      equal(data.state, "unknown", "address is unknown to BrowserID");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addressInfo with known seconday email", function() {
    transport.useResult("known_secondary");

    network.addressInfo(TEST_EMAIL, 'default', function onComplete(data) {
      equal(data.type, "secondary", "type is secondary");
      equal(data.state, "known", "address is known to BrowserID");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addressInfo with primary email", function() {
    transport.useResult("primary");

    network.addressInfo(TEST_EMAIL, 'default', function onComplete(data) {
      equal(data.type, "primary", "type is primary");
      ok("auth" in data, "auth field exists");
      ok("prov" in data, "prov field exists");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("addressInfo with XHR failure", function() {
    failureCheck(network.addressInfo, TEST_EMAIL, 'default');
  });

  asyncTest("changePassword happy case, expect complete callback with true status", function() {
    network.changePassword("oldpassword", "newpassword", function onComplete(status) {
      equal(status.success, true, "calls onComplete with true status");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("changePassword with incorrect old password, expect complete callback with false status", function() {
    transport.useResult("incorrectPassword");

    network.changePassword("oldpassword", "newpassword", function onComplete(status) {
      equal(status.success, false, "calls onComplete with false status");
      start();
    }, testHelpers.unexpectedFailure);
  });

  asyncTest("changePassword with XHR failure, expect error callback", function() {
    failureCheck(network.changePassword, "oldpassword", "newpassword");
  });

  asyncTest("cookiesEnabled with cookies enabled - return true status", function() {
    network.cookiesEnabledOverride = true;
    network.cookiesEnabled(function(status) {
      equal(status, true, "cookies are enabled, correct status");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("cookiesEnabled with cookies disabled - return true status", function() {
    network.cookiesEnabledOverride = false;
    network.cookiesEnabled(function(status) {
      equal(status, false, "cookies are disabled, correct status");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("cookiesEnabled with browser defined cookie status - wait and see", function() {
    network.cookiesEnabled(function(status) {
      equal(status, true, "hopefully cookies are enabled, correct status");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("cookiesEnabled with onComplete exception thrown - should not call onComplete a second time", function() {
    // Since we are manually throwing an exception, it must be caught
    // below.
    network.withContext(function() {
      var err;
      try {
        network.cookiesEnabled(function(status) {
          // if there is a problem, this callback will be called a second time
          // with a false status.
          equal(status, true, "cookies are enabled, correct status");
          start();

          throw "callback exception";
        }, testHelpers.unexpectedXHRFailure);
      } catch(e) {
        err = e;
      }
      equal(err, "callback exception", "correct exception caught");
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("prolongSession with authenticated user, success - call complete", function() {
    network.authenticate(TEST_EMAIL, "password", false, function() {
      network.prolongSession(function() {
        ok(true, "prolongSession completed");
        start();
      }, testHelpers.unexpectedXHRFailure);
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("prolongSession with XHR Failure - call failure", function() {
    transport.useResult("ajaxError");
    network.prolongSession(testHelpers.unexpectedSuccess, testHelpers.expectedXHRFailure);
  });

  asyncTest("sendInteractionData success - call success", function() {
    var data = {};
    network.sendInteractionData(data, function(status) {
      equal(status, true, "complete with correct status");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("sendInteractionData with XHR failure - call failure", function() {
    var data = {};
    transport.useResult("ajaxError");
    network.sendInteractionData(data, testHelpers.unexpectedSuccess, testHelpers.expectedXHRFailure);
  });

  asyncTest("usedAddressAsPrimary success - call success", function () {
    network.authenticate(TEST_EMAIL, "password", false, function() {
      transport.useResult("primaryTransition");
      network.usedAddressAsPrimary(TEST_EMAIL, function (status) {
        ok(status.success);
        start();
      }, testHelpers.unexpectedXHRFailure);
    });
  });

  asyncTest("usedAddressAsPrimary success - call no-op", function () {
    network.authenticate(TEST_EMAIL, "password", false, function() {
      transport.useResult("primary");
      network.usedAddressAsPrimary(TEST_EMAIL, function (status) {
        equal(status.success, false);
        start();
      }, testHelpers.unexpectedXHRFailure);
    });
  });

  asyncTest("certKey valid", function() {
    var pubKeyMock = {
      serialize: function() {}
    };

    network.certKey(TEST_EMAIL, pubKeyMock, "fxos.personatest.org", true,
      function(cert) {
      equal(typeof cert, "string");
      start();
    }, testHelpers.unexpectedXHRFailure);
  });

  asyncTest("certKey ajaxError", function() {
    var pubKeyMock = {
      serialize: function() {}
    };

    transport.useResult("ajaxError");
    network.certKey(TEST_EMAIL, pubKeyMock, "fxos.personatest.org", true,
      testHelpers.unexpectedSuccess,
      testHelpers.expectedXHRFailure);
  });

}());
