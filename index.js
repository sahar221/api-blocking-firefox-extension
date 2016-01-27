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
    gremlinSource = self.data.load("content/gremlins.js"),
    urlLib = require("sdk/url"),
    urlPriorityLib = require("lib/urls"),
    events = require("sdk/system/events"),
    featuresRuleParser = require("lib/featureParser"),
    featuresToCount = featuresRuleParser.parse("features.csv"),
    visitedUrls = new Set(),
    allowedDomains = [],
    makePageModObj,
    openNewTab,
    tabTree,
    args,
    onExit,
    currentProcessFeatures,
    debugMessage;


/**
 * Parses and wraps  line arguments given to the extension.  Valid
 * env options are the following:
 *
 *   - FF_API_DEPTH (int): How many times, recursively, to open links on a
 *                         website.  Defaults to 2.
 *   - FF_API_URL_PER_PAGE (int): The maximum number of URLs on the page to
 *                                open in new tabs.  Defaults to 3.
 *   - FF_API_SEC_PER_PAGE (int): The number of seconds to wait before
 *                                 searching the page for URLs to load.
 *                                 Defaults to 10 seconds.
 *   - FF_API_MERGE (int): If set to 1, the printed out JSON report of
 *                         feature usage will be merged into a single report
 *                         instead of broken out by source URL.
 *   - FF_API_DOMAINS (string): A comma separated list of domains that
 *                              we accept clicks to.
 */
args = {
    depth: env.FF_API_DEPTH || 2,
    urlsPerPage: env.FF_API_URL_PER_PAGE || 3,
    secPerPage: env.FF_API_SEC_PER_PAGE || 10,
    merge: (env.FF_API_MERGE === "1"),
    domains: (!!env.FF_API_DOMAINS) ? [] : env.FF_API_DOMAINS.split(",")
};

allowedDomains = allowedDomains.concat(args.domains);


debugMessage = function (msg) {
    if (debug === true) {
        console.log(msg);
    }
};


openNewTab = function (parentTab, aUrl) {

    var nodeInTabTree = tabTree.node(parentTab.id),
        urlToOpen = new urlLib.URL(aUrl, parentTab.url);

    if (!nodeInTabTree) {
        throw "Unable to find entry for tab " + parentTab.id + " in the node tree";
    }

    tabs.open({
        url: urlToOpen.toString(),
        onOpen: aTab => nodeInTabTree.addChild(aTab.id)
    });
};


currentProcessFeatures = (function () {

    var urlToFeatures = {};

    return {
        add: function (url, features) {
            if (urlToFeatures[url] === undefined) {
                urlToFeatures[url] = [];
            }

            urlToFeatures[url].push(features);

            return this;
        },
        getAll: function () {
            return urlToFeatures;
        },
        merged: function () {

            var report = {};

            Object.keys(urlToFeatures).forEach(function (url) {
                urlToFeatures[url].forEach(function (aFeatureSet) {
                    Object.keys(aFeatureSet).forEach(function (aFeature) {

                        if (report[aFeature] === undefined) {
                            report[aFeature] = 0;
                        }

                        report[aFeature] += aFeatureSet[aFeature]
                    });
                });
            });

            return report;
        }
    };
}());


onExit = function () {
    var featureReport = args.merge === true
        ? currentProcessFeatures.merged()
        : currentProcessFeatures.getAll();
    console.log(JSON.stringify(featureReport) + "\n");
};


makePageModObj = function (isForIFrame) {

    return {
        include: "*",
        contentScriptOptions: {
            debug: debug,
            features: featuresToCount,
            secPerPage: args.secPerPage,
            gremlinSource: gremlinSource,
            isIFrame: isForIFrame
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

            debugMessage(`Enterting: ${isForIFrame}, ${worker.tab.url}`);

            // If there isn't an item in the node tree for this node, then
            // we assume this is the first page load (ie the page being tested)
            // and we make it the root in the node tree we're tracking.
            if (tabTree === undefined) {
                visitedUrls.add(worker.tab.url);
                tabTree = tree.createTree(currentTabId);
                allowedDomains.push((new urlLib.URL(worker.tab.url)).host);
            }

            worker.port.on("content-request-record-blocked-features", function (data) {
                var {features, url} = data;
                debugMessage("content-request-record-blocked-features: " + worker.tab.url);
                currentProcessFeatures.add(url, features);
            });


            if (isForIFrame) {
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


pageMod.PageMod(makePageModObj(true));
pageMod.PageMod(makePageModObj(false));


events.on("quit-application", onExit, true);
