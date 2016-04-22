// Utils for Privacy Badger
"use strict";

const { Cc, Ci, Cu } = require("chrome");
const ThirdPartyUtil = Cc["@mozilla.org/thirdpartyutil;1"]
                       .getService(Ci.mozIThirdPartyUtil);
const ioService = Cc["@mozilla.org/network/io-service;1"]
                       .getService(Ci.nsIIOService);
var Services;
var Services;
Cu.import("resource://gre/modules/Services.jsm");
const eTLDService = Services.eTLD;
const timers = require('sdk/timers');
const prefs = require('sdk/simple-prefs').prefs;
const { storage } = require("sdk/simple-storage");

/**
 * Tries to get the window associated with a channel. If it cannot, returns
 * null and logs an explanation to the console. This is not necessarily an
 * error, as many internal requests are not associated with a window, e.g. OCSP
 * or Safe Browsing requests.
 */

let getWindowForChannel = function(channel) {
  let nc;
  try {
    nc = channel.notificationCallbacks ? channel.notificationCallbacks : channel.loadGroup.notificationCallbacks;
  } catch(e) {
    console.log("ERROR missing loadgroup notificationCallbacks for " + channel.URI.spec);
    return null;
  }
  if (!nc) {
    console.log("ERROR no loadgroup notificationCallbacks for " + channel.URI.spec);
    return null;
  }

  let loadContext;
  try {
    loadContext = nc.getInterface(Ci.nsILoadContext);
  } catch(ex) {
    try {
      loadContext = channel.loadGroup.notificationCallbacks
        .getInterface(Ci.nsILoadContext);
    } catch(ex) {
      console.log("ERROR missing loadcontext", channel.URI.spec, ex.name);
      return null;
    }
  }

  let contentWindow;
  try {
    contentWindow = loadContext.associatedWindow;
  } catch(ex) {
    //console.log("ERROR missing contentWindow", channel.URI.spec, ex.name);
  }

  return contentWindow;
};

/**
 * Returns the top window in the given channel's associated window hierarchy.
 */
let getTopWindowForChannel = function(channel) {
  let win = getWindowForChannel(channel);
  if (win) {
    return win.top;
  }
  return null;
};

/**
 * Gets the most recent nsIDOMWindow
 */
function getMostRecentWindow() {
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
             .getService(Ci.nsIWindowMediator);
  return wm.getMostRecentWindow("navigator:browser");
}

const tabUtils = require("sdk/tabs/utils");

function getMostRecentContentWindow() {
  var tab = tabUtils.getSelectedTab(getMostRecentWindow());
  return tabUtils.getTabContentWindow(tab);
}

function getAllWindows() {
  return tabUtils.getTabs().map(function(tab) {
    return tabUtils.getTabContentWindow(tab);
  });
}

/**
 * Tries to get the tab associated with a channel. If it cannot, returns
 * null and logs an explanation to the console. This is not necessarily an
 * error, as many internal requests are not associated with a window, e.g. OCSP
 * or Safe Browsing requests.
 */

let getTabForChannel = function(channel, window) {
  // If we weren't passed the window, get it
  if(arguments.length < 2) {
    window = getTopWindowForChannel(channel);
  }
  if(!window) { return null; }

  // This god-awful chain comes from
  // <https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser#From_a_sidebar>
  let gBrowser = window.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsIDocShellTreeItem)
        .rootTreeItem
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindow).gBrowser;
  if (!gBrowser || typeof gBrowser.getTabForBrowser !== 'function') {
    // console.log('WARN gBrowser is not a browser');
    return null;
  }

  let tab = gBrowser.getTabForBrowser(gBrowser.getBrowserForDocument(window.document));

  if(tab) {
    return tab;
  }

  return null;
};
exports.getTabForChannel = getTabForChannel;

/**
 * Given a high-level tab, turn into low-level xul tab object to get window.
 */
function getWindowForSdkTab(sdkTab) {
  for (let tab of tabUtils.getTabs()) {
    if (sdkTab.id === tabUtils.getTabId(tab)) {
      return tabUtils.getTabContentWindow(tab);
    }
  }
  return null;
}


/**
 * Get the nsIDOMWindow that corresponds to a shouldLoad context.
 * Feels like throwing spaghetti at a wall but whatevs.
 */
function getWindowForContext(aContext) {
  if (aContext instanceof Ci.nsIDOMWindow) {
    return aContext;
  } else if (aContext instanceof Ci.nsIDOMNode) {
    return aContext.ownerDocument ? aContext.ownerDocument.defaultView
                                  : aContext.defaultView;
  }

  try {
    return aContext.QueryInterface(Ci.nsIHttpChannel);
  } catch(e) {
    return null;
  }
}

/**
 * Converts an IP address to a number. If given input is not a valid IP address
 * then 0 is returned.
 * @param ip {String}
 * @return {Integer}
 */
function ipAddressToNumber(ip) {
  // Separate IP address into octets, make sure there are four.
  let octets = ip.split('.');
  if (octets.length !== 4) {
    return 0;
  }

  let result = 0;
  let maxOctetIndex = 3;
  for (let i = maxOctetIndex; i >= 0; i--) {
    let octet = parseInt(octets[maxOctetIndex - i], 10);

    // If octet is invalid return early, no need to continue.
    if (Number.isNaN(octet) || octet < 0 || octet > 255) {
      return 0;
    }

    // Use bit shifting to store each octet for result.
    result |= octet << (i * 8);
  }

  // Results of bitwise operations in JS are interpreted as signed
  // so use zero-fill right shift to return unsigned number.
  return result >>> 0;
}

/**
 * Determines if host is private, that is localhost or the IP address spaces
 * specified by RFC 1918.
 * @param host {String}
 * @return {Boolean}
 */
exports.isPrivateHost = function(host) {
  // Check for localhost match.
  if (host === 'localhost') {
    return true;
  }

  // Check for private IP address match.
  let ipNumber = ipAddressToNumber(host);
  let privateIpMasks = {
    '127.0.0.0': '255.0.0.0',
    '10.0.0.0': '255.0.0.0',
    '172.16.0.0': '255.240.0.0',
    '192.168.0.0': '255.255.0.0',
  };
  for (let ip in privateIpMasks) {
    // Ignore object properties.
    if (! privateIpMasks.hasOwnProperty(ip)) {
      continue;
    }

    // Compare given IP value to private IP value using bitwise AND.
    // Make sure result of AND is unsigned by using zero-fill right shift.
    let privateIpNumber = ipAddressToNumber(ip);
    let privateMaskNumber = ipAddressToNumber(privateIpMasks[ip]);
    if (((ipNumber & privateMaskNumber) >>> 0) === privateIpNumber) {
      return true;
    }
  }

  // Getting here means given host didn't match localhost
  // or other private addresses so return false.
  return false;
}


/**
 * getBaseDomain - for "www.bbc.co.uk", this would be "bbc.co.uk" (the eTLD+1)
 * Note that this fails for domains with a leading dot (some raw hosts)
 * @param {nsIURI}
 * @return {UTF8String}
 */
exports.getBaseDomain = ThirdPartyUtil.getBaseDomain;

/**
 * Determines the base domain of a given host string.
 * @param {String} host The host to analyze.
 * @param {Integer} additionalParts The number of domain name parts to return
 *                                  in addition to the public suffix (optional).
 * @return {String}
 */
exports.getBaseDomainFromHost = eTLDService.getBaseDomainFromHost;

/**
 * getParentDomain - for "www.radio.bbc.co.uk," this would be "radio.bbc.co.uk"
 * for "bbc.co.uk," this would be bbc.co.uk.
 * Not useful right now, but may be for scoping later since a domain
 * can set cookies for its parent.
 * @param {nsIURI}
 * @return {UTF8String}
 */
exports.getParentDomain = function(uri) {
  let suffix = eTLDService.getPublicSuffix(uri);
  let suffixLength = suffix.split('.').length;
  let hostArray = uri.host.split('.');

  // is this already an eTLD+1 or an eTLD+2? return the eTLD+1
  if (hostArray.length - suffixLength < 3) {
    return eTLDService.getBaseDomain(uri);
  }

  // eat away at the left
  return hostArray.slice(1).join('.');
};


exports.getWindowForChannel = getWindowForChannel;
exports.getMostRecentWindow = getMostRecentWindow;
exports.getMostRecentContentWindow = getMostRecentContentWindow;
exports.getTopWindowForChannel = getTopWindowForChannel;
exports.getWindowForContext = getWindowForContext;
exports.getAllWindows = getAllWindows;
exports.getWindowForSdkTab = getWindowForSdkTab;
