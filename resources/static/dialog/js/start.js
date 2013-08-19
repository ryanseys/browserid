/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function() {
  "use strict";

  var bid = BrowserID,
      moduleManager = bid.module,
      modules = bid.Modules,
      user = bid.User,
      network = bid.Network,
      mediator = bid.Mediator;

  network.init();
  user.init();

  var hash = window.location.hash || "",
      continuation = hash.indexOf("#AUTH_RETURN") > -1;

  moduleManager.register("interaction_data", modules.InteractionData);
  moduleManager.start("interaction_data", { continuation: continuation });

  // DOM_LOADING is only set if preffed on on the server.
  var domLoading = bid.DOM_LOADING;
  if (domLoading) {
    mediator.publish("dom_loading", { eventTime: domLoading });
  }

  moduleManager.register("development", modules.Development);
  moduleManager.start("development");

  moduleManager.register("cookie_check", modules.CookieCheck);
  moduleManager.start("cookie_check", {
    ready: function(status) {
      if(!status) return;

      moduleManager.register("dialog", modules.Dialog);
      moduleManager.register("add_email", modules.AddEmail);
      moduleManager.register("authenticate", modules.Authenticate);
      moduleManager.register("check_registration", modules.CheckRegistration);
      moduleManager.register("is_this_your_computer", modules.IsThisYourComputer);
      moduleManager.register("pick_email", modules.PickEmail);
      moduleManager.register("verify_primary_user", modules.VerifyPrimaryUser);
      moduleManager.register("provision_primary_user", modules.ProvisionPrimaryUser);
      moduleManager.register("primary_user_provisioned", modules.PrimaryUserProvisioned);
      moduleManager.register("primary_user_not_provisioned", modules.PrimaryUserNotProvisioned);
      moduleManager.register("primary_offline", modules.PrimaryOffline);
      moduleManager.register("generate_assertion", modules.GenerateAssertion);
      moduleManager.register("xhr_delay", modules.XHRDelay);
      moduleManager.register("xhr_disable_form", modules.XHRDisableForm);
      moduleManager.register("set_password", modules.SetPassword);
      moduleManager.register("rp_info", modules.RPInfo);
      moduleManager.register("inline_tospp", modules.InlineTosPp);
      moduleManager.register("complete_sign_in", modules.CompleteSignIn);

      moduleManager.start("xhr_delay");
      moduleManager.start("xhr_disable_form");
      moduleManager.start("dialog");
      moduleManager.start("inline_tospp");
    }
  });

}());
