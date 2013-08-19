/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * interaction_data is a module responsible for collecting and
 * reporting anonymous interaction data that represents a user's
 * interaction with the dialog.  It aggregates information that is not
 * user specific like the user's OS, Browser, and the interface
 * elements they've clicked on.  It stores this information in
 * localstorage, and at initialization reports previous interaction
 * data to the server.  This data is then used to optimize the user
 * experience of the Persona dialog.
 *
 * More information about interaction data and 'Key Performance Indicators'
 * stats that are derived from it:
 *
 *  https://wiki.mozilla.org/Privacy/Reviews/KPI_Backend
 */

// TODO:
//  * should code explicitly call .addEvent?  or instead should this module
//    listen for events via the mediator?

BrowserID.Modules.InteractionData = (function() {
  "use strict";

  var bid = BrowserID,
      model = bid.Models.InteractionData,
      user = bid.User,
      storage = bid.Storage,
      errors = bid.Errors,
      complete = bid.Helpers.complete,
      dom = bid.DOM,
      REPEAT_COUNT_INDEX = 3,
      sc;

  function removeGetData(msg, data) {
    if (msg && data.network && data.network.type && data.network.url) {
      return msg + "." + data.network.type + data.network.url.split('?')[0];
    } else {
      return 'xhr.malformed_report';
    }
  }

  function parseErrorScreen(msg, data) {
    var parts = [];

    if (data.action) {
      var errorType = _.keyOf(errors, data.action)
                          || data.action.title || "unknown";
      parts.push(errorType);
    }

    if (data.network && data.network.status > 399) {
      parts.push(data.network.status);
    }

    if (!parts.length) parts[0] = "unknown";

    return 'screen.error.' + parts.join('.');
  }

  /**
   * This is a translation table from a message on the mediator to a KPI name.
   * Names can be modified or added to the KPI storage directly.
   * A name can be translated by using either a string or a function.
   *
   * value side contains - purpose
   * null - no translation, use mediator name for KPI name.
   * string - translate from mediator name to string.
   * function - function takes two arguments, msg and data.  These come
   *   directly from the mediator.  Function returns a value.  If no value is
   *   returned, field will not be saved to KPI data set.
   */

  /**
   * Explanation of KPIs:
   *
   * screen.* - the user sees a new screen (generally speaking, though there
   *   may be a couple of exceptions).
   * window.redirect_to_primary - the user has to authenticate with their
   *   IdP so they are being redirected away.
   * window.unload - the last thing in every event stream.
   * generate_assertion - the order was given to generate an assertion.
   * assertion_generated - the assertion generation is complete -
   *   these two together are useful to measure how long crypto is taking
   *   on various devices.
   * user.user_staged - a new user verification email is sent
   * user.user_confirmed - the user has confirmed and the dialog is closing.
   *   These two together give us the info needed to see how long it takes
   *   users to confirm their address - iff they keep their dialog open.
   * user.email_staged/user.email_confirmed is similar to
   *   user.user_staged/confirmed except it is when the user adds a secondary
   *   email to their account.
   * user.logout - that is the user has clicked "this is not me."
   * xhr_complete.GET/wsapi/user_creation_status
   *   Various network traffic
   */

  var MediatorToKPINameTable = {
    service: function(msg, data) { return "screen." + data.name; },
    cancel_state: "screen.cancel",
    primary_user_authenticating: "window.redirect_to_primary",
    dom_loading: "window.dom_loading",
    window_unload: "window.unload",
    channel_established: "window.channel_established",
    user_can_interact: "user.can_interact",
    generate_assertion: null,
    assertion_generated: null,
    user_staged: "user.user_staged",
    user_confirmed: "user.user_confirmed",
    email_staged: "user.email_staged",
    email_confirmed: "user.email_confirmed",
    reset_password_staged: "user.reset_password_staged",
    reset_password_confirmed: "user.reset_password_confirmed",
    reverify_email_staged: "user.reverify_email_staged",
    reverify_email_confirmed: "user.reverify_email_confirmed",
    notme: "user.logout",
    enter_password: "authenticate.enter_password",
    password_submit: "authenticate.password_submitted",
    authentication_success: "authenticate.password_success",
    authentication_fail: "authenticate.password_fail",
    xhr_complete: removeGetData,
    error_screen: parseErrorScreen
  };

  function getKPIName(msg, data) {
    /*jshint validthis: true */
    var self=this,
        kpiInfo = self.mediatorToKPINameTable[msg];

    var type = typeof kpiInfo;
    if(kpiInfo === null) return msg;
    if(type === "string") return kpiInfo;
    if(type === "function") return kpiInfo(msg, data);
  }

  function publishCurrent(done) {
    /*jshint validthis: true */
    // Publish any outstanding data.  Unless this is a continuation, previous
    // session data must be published independently of whether the current
    // dialog session is allowed to sample data. This is because the original
    // dialog session has already decided whether to collect data.
    //
    // beginSampling must happen afterwards, since we need to send and
    // then scrub out the previous sessions data.

    var self = this;

    model.publishCurrent(function(status) {
      user.withContext(function(context) {
        beginSampling.call(self, context);

        var msg = status ? "interaction_data_send_complete"
                         : "interaction_data_send_error";
        self.publish(msg);

        complete(done, status);
      });
    });
  }

  function beginSampling(context) {
    /*jshint validthis: true */
    var self = this,
        dataSampleRate = context.data_sample_rate,
        serverTime = context.server_time;

    // set the sample rate as defined by the server.  It's a value
    // between 0..1, integer or float, and it specifies the percentage
    // of the time that we should capture
    var sampleRate = dataSampleRate || 0;

    if (typeof self.samplingEnabled === "undefined") {
      // now that we've got sample rate, let's smash it into a boolean
      // probalistically
      self.samplingEnabled = Math.random() <= sampleRate;
    }

    // if we're not going to sample, kick out early.
    if (!self.samplingEnabled) {
      return;
    }

    // server_time is sent in milliseconds. The promise to users and data
    // safety is the timestamp would be at a 10 minute resolution.  Round to the
    // previous 10 minute mark.
    var TEN_MINS_IN_MS = 10 * 60 * 1000,
        roundedServerTime = Math.floor(serverTime / TEN_MINS_IN_MS) * TEN_MINS_IN_MS;

    var newKPIs = _.extend(self.initialKPIs, {
      event_stream: self.initialEventStream,
      sample_rate: sampleRate,
      timestamp: roundedServerTime,
      local_timestamp: self.startTime.toString(),
      lang: dom.getAttr('html', 'lang') || null,
      // this will be overridden in state.js if a new account is created.
      new_account: false
    });

    if (window.screen) {
      newKPIs.screen_size = {
        width: window.screen.width,
        height: window.screen.height
      };
    }

    // cool.  now let's persist the initial data.  This data will be published
    // as soon as the first session_context completes for the next dialog
    // session.  Use a push because old data *may not* have been correctly
    // published to a down server or erroring web service.
    model.push(newKPIs);

    self.initialEventStream = self.initialKPIs = null;

    self.samplesBeingStored = true;
  }

  function onKPIData(msg, kpiData) {
    /*jshint validthis: true*/
    this.addKPIData(kpiData);
  }

  function addKPIData(kpiData) {
    /*jshint validthis: true */
    // currentData will be undefined if sampling is disabled.
    var currentData = this.getCurrentKPIs();
    if (currentData) {
      _.extend(currentData, kpiData);
      setCurrentKPIs.call(this, currentData);
    }
  }

  function updateStartTime(newStartTime) {
    /*jshint validthis: true */
    var self=this,
        eventStream = self.getCurrentEventStream();

    // Base the offset of any event already on the event stream off of the new
    // startTime.
    if (eventStream && eventStream.length) {
      var delta = self.startTime - newStartTime;

      for (var i=0, event; event=eventStream[i]; ++i) {
        event[1] += delta;
      }

      setCurrentEventStream.call(self, eventStream);
    }

    self.startTime = newStartTime;
  }

  function addEvent(msg, data) {
    /*jshint validthis: true */
    data = data || {};
    var self=this;

    if (msg === "start_time") updateStartTime.call(self, data);
    if (self.samplingEnabled === false) return;

    var eventName = getKPIName.call(self, msg, data);
    if (!eventName) return;

    if (preventDuplicateXhrEvents.call(self, eventName)) return;

    var eventData = [ eventName,
      (data.eventTime || new Date()) - self.startTime ];

    if (data.duration) eventData.push(data.duration);

    var eventStream = self.getCurrentEventStream();
    if (eventStream) {
      eventStream.push(eventData);
      setCurrentEventStream.call(self, eventStream);
    }

    return eventData;
  }

  function preventDuplicateXhrEvents(eventName) {
    /*jshint validthis: true */
    var self=this;
    var eventStream = self.getCurrentEventStream();

    // Check if event is the same as the last event. If it is, update the
    // number of times the last event was called. If not, continue as always.
    if (/^xhr_complete/.test(eventName) && eventStream && eventStream.length) {
      var lastEvent = eventStream[eventStream.length - 1];
      if (lastEvent[0] === eventName) {
        // same xhr event as the last one. Update the count.
        var eventCallCount = lastEvent[REPEAT_COUNT_INDEX] || 1;
        eventCallCount++;
        lastEvent[REPEAT_COUNT_INDEX] = eventCallCount;
        setCurrentEventStream.call(self, eventStream);
        return lastEvent;
      }
    }
  }

  function getCurrentKPIs() {
    /*jshint validthis: true */
    var self=this;
    if(self.samplingEnabled === false) return;

    if (self.samplesBeingStored) {
      return model.getCurrent();
    }
    else {
      return self.initialKPIs;
    }
  }

  function setCurrentKPIs(kpis) {
    /*jshint validthis: true */
    var self=this;
    if (self.samplesBeingStored) {
      model.setCurrent(kpis);
    }
    else {
      self.initialKPIs = kpis;
    }
  }

  function getCurrentEventStream() {
    /*jshint validthis: true */
    var self=this;
    if(self.samplingEnabled === false) return;

    if (self.samplesBeingStored) {
      var d = model.getCurrent() || {};
      if (!d.event_stream) d.event_stream = [];
      return d.event_stream;
    }
    else {
      return self.initialEventStream;
    }
  }

  function setCurrentEventStream(eventStream) {
    /*jshint validthis: true*/
    var self=this;

    if (self.samplesBeingStored) {
      var d = model.getCurrent() || {};
      d.event_stream = eventStream;
      model.setCurrent(d);
    }
    else {
      self.initialEventStream = eventStream;
    }
  }

  var Module = bid.Modules.Module.extend({
    start: function(options) {
      options = options || {};

      var self = this;
      self.mediatorToKPINameTable = MediatorToKPINameTable;

      // options.samplingEnabled is used for testing purposes.
      //
      // If samplingEnabled is not specified in the options, and this is not
      // a continuation, samplingEnabled will be decided on the first "
      // context_info" event, which corresponds to the first time
      // 'session_context' returns from the server.
      // samplingEnabled flag ignored for a continuation.
      self.samplingEnabled = options.samplingEnabled;

      // continuation means the users dialog session is continuing, probably
      // due to a redirect to an IdP and then a return after authentication.
      if (options.continuation) {
        // There will be no current data if the previous session was not
        // allowed to save.
        var lastSessionsKPIs = model.getCurrent();
        if (lastSessionsKPIs) {
          self.startTime = Date.parse(lastSessionsKPIs.local_timestamp);


          // instead of waiting for session_context to start appending data to
          // localStorage, start saving into localStorage now.
          self.samplingEnabled = self.samplesBeingStored = true;
        }
        else {
          // If there was no previous data, that means data collection
          // was not allowed for the previous session.  Return with no further
          // action, data collection is not allowed for this session either.
          self.samplingEnabled = false;
          return;
        }
      }
      else {
        // publish any outstanding KPIs as soon as we start. Do not even wait
        // for onSesisonContext.
        // Set a default start time. The default is overridden if the
        // "start_time" message is triggerred
        self.startTime = new Date();

        // The initialEventStream is used to store events until session context
        // is fetched. Once it is known whether the user's data will be saved,
        // initialEventStream will either be discarded or made into the data
        // set that is sent to the server.
        self.initialEventStream = [];

        // the initialKPIs are used to store KPIs until session context is
        // fetched.
        self.initialKPIs = {};

        self.samplesBeingStored = false;

        publishCurrent.call(self);
      }

      // on all events, update event_stream
      self.subscribeAll(addEvent);
      self.subscribe('kpi_data', onKPIData, self);
    },

    addKPIData: addKPIData,
    addEvent: addEvent,
    getCurrentKPIs: getCurrentKPIs,
    getCurrentEventStream: getCurrentEventStream,
    publishCurrent: publishCurrent

    // BEGIN TEST API
    ,
    setNameTable: function(table) {
      this.mediatorToKPINameTable = table;
    },

    enable: function() {
      this.samplingEnabled = true;
    },

    disable: function() {
      this.samplingEnabled = false;
    },
    REPEAT_COUNT_INDEX: REPEAT_COUNT_INDEX
    // END TEST API
  });

  sc = Module.sc;

  return Module;

}());
