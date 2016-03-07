"use strict";


var debug = false,
    timers = require("sdk/timers"),
    pageMod = require("sdk/page-mod"),
    tabs = require("sdk/tabs"),
    tree = require("lib/tree"),
    system = require("sdk/system"),
    self = require("sdk/self"),
    {env} = require('sdk/system/environment'),
    fileIO = require("sdk/io/file"),
    urlLib = require("sdk/url"),
    urlPriorityLib = require("lib/urls"),
    events = require("sdk/system/events"),
    featuresRuleParser = require("lib/featureParser"),
    featuresToCount = featuresRuleParser.parse("features.csv"),
    visitedUrls = new Set(),
    allowedDomains = [],
    performanceMeasures = {},
    gremlinSource,
    makePageModObj,
    openNewTab,
    tabTree,
    args,
    onExit,
    javascriptMeasurements,
    currentProcessFeatures = {},
    debugMessage;


/**
 * Parses and wraps  line arguments given to the extension.  Valid
 * env options are the following:
 *
 *   - FF_API_URL (string): The initial URL to load and test against.
 *   - FF_API_DEPTH (int): How many times, recursively, to open links on a
 *                         website.  Defaults to 2.
 *   - FF_API_URL_PER_PAGE (int): The maximum number of URLs on the page to
 *                                open in new tabs.  Defaults to 3.
 *   - FF_API_SEC_PER_PAGE (int): The number of seconds to wait before
 *                                 searching the page for URLs to load.
 *                                 Defaults to 10 seconds.
 *   - FF_API_DOMAINS (string): A comma separated list of domains that
 *                              we accept clicks to.
 *   - FF_API_MANUAL (int): If set to 1, then no page will be automatically
 *                          opened, and no links will be automatically followed
 *                          when running the extension.
 *   - FF_API_PERFORMANCE (int): If set to 1, then we record performance
 *                               measurements instead of API useage ones.
 *   - FF_API_JS_REPORT (int): If set to 1, then we include in the JSON
 *                             report information about what script was
 *                             executed on each page.
 *
 */
args = {
    url: env.FF_API_URL,
    depth: env.FF_API_DEPTH || 2,
    urlsPerPage: env.FF_API_URL_PER_PAGE || 3,
    secPerPage: env.FF_API_SEC_PER_PAGE || 10,
    domains: (!env.FF_API_RELATED_DOMAINS) ? [] : env.FF_API_RELATED_DOMAINS.split(","),
    manual: (env.FF_API_MANUAL === "1"),
    performance: env.FF_API_PERFORMANCE,
    jsReport: (env.FF_API_JS_REPORT === "1")
};


allowedDomains = allowedDomains.concat(args.domains);
if (!args.manual && !args.performance) {
    gremlinSource = self.data.load("content/gremlins.js");
}


debugMessage = function (msg) {
    if (debug === true) {
        console.log(msg);
    }
};


openNewTab = function (parentTab, aUrl) {

    var nodeInTabTree = tabTree.node(parentTab.id),
        urlToOpen = new urlLib.URL(aUrl, parentTab.url);

    if (args.manual) {
        return;
    }

    if (!nodeInTabTree) {
        throw "Unable to find entry for tab " + parentTab.id + " in the node tree";
    }

    tabs.open({
        url: urlToOpen.toString(),
        onOpen: aTab => nodeInTabTree.addChild(aTab.id)
    });
};


javascriptMeasurements = (function () {

    var javascriptMeasures = {},
        receivedValidReport = false;

    return {
        add: function (url, jsData) {

            receivedValidReport = true;

            if (javascriptMeasures[url] === undefined) {
                javascriptMeasures[url] = [];
            }

            javascriptMeasures[url].push(jsData);
        },
        getAll: function () {
            return receivedValidReport && javascriptMeasures;
        }
    };
}());


currentProcessFeatures = (function () {

    var urlToFeatures = {},
        receivedValidReport = false;

    return {
        add: function (url, features, timeline) {

            var featureToIdMapping = {},
                featureIdToCount = {};

            receivedValidReport = true;

            if (urlToFeatures[url] === undefined) {
                urlToFeatures[url] = [];
            }

            Object.keys(features).forEach(function (aFeatureName) {
                var featureId = features[aFeatureName].id;
                featureToIdMapping[aFeatureName] = featureId;
                featureIdToCount[featureId] = features[aFeatureName].count;
            });

            urlToFeatures[url].push({
                mapping: featureToIdMapping,
                counts: featureIdToCount,
                timeline: timeline
            });

            return this;
        },
        getAll: function () {
            return receivedValidReport && urlToFeatures;
        }
    };
}());


onExit = function () {

    var featureReport;

    if (args.performance) {
        dump("FF-API-EXTENSION: " + JSON.stringify(performanceMeasures) + "\n");
        return;
    }

    featureReport = currentProcessFeatures.getAll();

    if (args.jsReport) {
        dump("FF-API-EXTENSION: " + JSON.stringify({
            features: featureReport,
            javascript: javascriptMeasurements.getAll()
        }) + "\n");
        return;
    }

    dump("FF-API-EXTENSION: " + JSON.stringify(featureReport) + "\n");
};


makePageModObj = function (isForIFrame) {

    return {
        include: "*",
        contentScriptOptions: {
            debug: debug,
            features: featuresToCount,
            secPerPage: args.secPerPage,
            gremlinSource: gremlinSource,
            manual: args.manual,
            isIFrame: isForIFrame,
            performance: args.performance,
            jsReport: args.jsReport
        },
        contentScriptFile: [
            "./content/debug.js",
            "./content/features.js",
            "./content/instrument.js"
        ],
        contentScriptWhen: "start",
        attachTo: ["existing", isForIFrame ? "frame" : 'top'],
        onAttach: function (worker) {

            var currentTabId = worker.tab.id,
                treeDepth;

            if (args.performance) {
                worker.port.on("content-request-performance-numbers", function (data) {
                    performanceMeasures = data;
                    system.exit(0);
                });
                return;
            }

            debugMessage(`Enterting: ${isForIFrame}, ${worker.tab.url}`);

            // If there isn't an item in the node tree for this node, then
            // we assume this is the first page load (ie the page being tested)
            // and we make it the root in the node tree we're tracking.
            if (tabTree === undefined) {
                visitedUrls.add(worker.tab.url);
                tabTree = tree.createTree(currentTabId);
                allowedDomains.push((new urlLib.URL(worker.tab.url)).host);
            }

            worker.port.on("content-request-record-used-features", function (data) {
                var {features, timeline, url} = data;
                currentProcessFeatures.add(url, features, timeline);
            });

            worker.port.on("content-request-record-javascript", function (data) {
                var {javacript, url} = data;
                javascriptMeasurements.add(url, javacript)
            });

            if (isForIFrame || args.manual) {
                return;
            }

            timers.setTimeout(function () {
                // And now that we've opened up all the child links needed
                // on this page, we can close the current page.  And if this
                // is the last tab, also close the tab.
                if (worker.tab && worker.tab.close) {
                    worker.tab.close(function () {
                        if (tabs.length === 0) {
                            system.exit(0);
                        }
                    });
                    return;
                }

                if (tabs.length === 0) {
                    system.exit(0);
                }
            }, args.secPerPage * 2000);

            treeDepth = tabTree.depth(currentTabId);
            if (treeDepth >= args.depth) {
                return;
            }

            worker.port.on("content-request-found-urls", function (foundUrls) {

                var [activatedUrls, otherUrls] = foundUrls,
                    highPriorityUrls,
                    lowPriorityUrls;

                debugMessage("content-request-found-urls: " + worker.tab.url);

                highPriorityUrls = urlPriorityLib
                    .prioritizeUrls(activatedUrls, allowedDomains)
                    .filter(aUrl => !visitedUrls.has(aUrl));

                lowPriorityUrls = urlPriorityLib
                    .prioritizeUrls(otherUrls, allowedDomains)
                    .filter(aUrl => !visitedUrls.has(aUrl));

                highPriorityUrls.concat(lowPriorityUrls)
                    .reduce(function (countOpened, aUrl) {
                        if (countOpened >= args.urlsPerPage) {
                            return countOpened;
                        }
                        if (visitedUrls.has(aUrl)) {
                            return countOpened;
                        };
                        visitedUrls.add(aUrl);
                        openNewTab(worker.tab, aUrl);
                        countOpened += 1;
                        return countOpened;
                    }, 0);
            });
        }
    };
};


if (args.url || args.manual || args.performance) {

    pageMod.PageMod(makePageModObj(true));
    pageMod.PageMod(makePageModObj(false));

    events.on("quit-application", onExit, true);
    if (!args.manual) {
        timers.setTimeout(function () {
              tabs.activeTab.url = args.url;
        }, 1000);
    }
} else {
    dump("Not binding to page, no root URL provided in FF_API_URL enviroment argument");
}
