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
    boundTabs = {},
    readFileToString,
    origHost,
    openNewTab,
    tabTree,
    boundTabs = {},
    args,
    onExit,
    currentProcessFeatures,
    fileWriter,
    gremlinSource;

/**
 * Parses and wraps  line arguments given to the extension.  Valid
 * env options are the following:
 *
 *   - FF_API_OUT (string): The path to write the API usage report to.  If this
 *                          is not provided, output will be written to STDOUT
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
 */
args = {
    toStdOut: !!env.FF_API_OUT,
    outputPath: env.FF_API_OUT,
    depth: env.FF_API_DEPTH || 2,
    urlsPerPage: env.FF_API_URL_PER_PAGE || 3,
    secPerPage: env.FF_API_SEC_PER_PAGE || 10,
    merge: !!env.FF_API_MERGE
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


fileWriter = (function () {
    var textWriter;

    if (args.outputPath) {
        textWriter = fileIO.open(args.outputPath, "w");
        if (!textWriter.closed) {
            throw "Unable to open file to write to at '" + args.outputPath + "'.";
        }
    }

    return {
        write: function (data) {
            if (!textWriter) {
                console.log(JSON.stringify(data) + "\n");
            } else {
                return textWriter.write(JSON.stringify(data) + "\n");
            }
        },
        close: function () {
            if (textWriter) {
                return textWriter.close();
            }
        }
    };
}());


onExit = function () {
    var featureReport = args.merge
        ? currentProcessFeatures.merged()
        : currentProcessFeatures.getAll();
    fileWriter.write(featureReport);
    fileWriter.close();
};


pageMod.PageMod({
    include: "*",
    contentScriptOptions: {
        debug: debug,
        features: featuresToCount,
        secPerPage: args.secPerPage,
        gremlinSource: gremlinSource
    },
    contentScriptFile: [
        "./content/debug.js",
        "./content/features.js",
        "./content/instrument.js"
    ],
    contentScriptWhen: "start",
    attachTo: ['top', 'frame'],
    onAttach: function (worker) {

        var currentTabId = worker.tab.id,
            treeDepth;

        // If there isn't an item in the node tree for this node, then
        // we assume this is the first page load (ie the page being tested)
        // and we make it the root in the node tree we're tracking.
        if (tabTree === undefined) {
            visitedUrls.add(worker.tab.url);
            tabTree = tree.createTree(currentTabId);
            origHost = urlLib.URL(worker.tab.url).host;
        }

        worker.port.on("content-request-record-blocked-features", function (data) {
            var {features, url} = data;
            currentProcessFeatures.add(url, features);
        });


        // Similarly, if we're already at the max depth we care about in
        // the tab tree, we dont need to worry about URLs returned
        // from the child page at all.  This check prevents the recursion
        // from increasing too far by making the client page's "open
        // child urls" call a NOOP
        if (boundTabs[currentTabId] !== undefined) {
            return;
        }
        boundTabs[currentTabId] = true;


        timers.setTimeout(function () {
            // And now that we've opened up all the child links needed
            // on this page, we can close the current page.  And if this
            // is the last tab, also close the tab.
            worker.tab.close(function () {
                if (tabs.length === 0) {
                    system.exit(0);
                }
            });
        }, args.secPerPage * 1500);

        treeDepth = tabTree.depth(currentTabId);
        if (treeDepth >= args.depth) {
            return;
        }

        worker.port.on("content-request-found-urls", function (foundUrls) {
            var [activatedUrls, otherUrls] = foundUrls,
                highPriorityUrls,
                lowPriorityUrls;

            highPriorityUrls = urlPriorityLib
                .prioritizeUrls(activatedUrls, origHost)
                .filter(aUrl => !visitedUrls.has(aUrl));

            lowPriorityUrls = urlPriorityLib
                .prioritizeUrls(otherUrls, origHost)
                .filter(aUrl => !visitedUrls.has(aUrl));

            highPriorityUrls.concat(lowPriorityUrls)
                .reduce(function (countOpened, aUrl) {
                    if (countOpened === args.urlsPerPage) {
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
});


events.on("quit-application", onExit, true);
