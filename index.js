"use strict";

var debug = true,
    pageMod = require("sdk/page-mod"),
    buttons = require('sdk/ui/button/action'),
    tabs = require("sdk/tabs"),
    system = require("sdk/system"),
    fileIO = require("sdk/io/file"),
    featuresModel = require("lib/features"),
    statsModel = require("lib/stats"),
    featuresRuleParser = require("lib/featureParser"),
    featuresToCount = featuresRuleParser.parse("./features.csv"),
    fileWriter,
    onPrefOpen;


fileWriter = (function () {

    var outputPath = system.staticArgs.output,
        textWriter;

    if (outputPath === undefined) {
        throw "Firefox opened without specifiying a path to write feature data to.  Should be called with something like `--static-args={output: '/tmp/out'}.";
    }

    textWriter = fileIO.open(outputPath, "w");
    if (!textWriter.closed) {
        throw "Unable to open file to write to at '" + outputPath + "'.";
    }

    return {
        write: function (data) {
            return textWriter.write(JSON.stringify(data) + "\n");
        },
        close: function () {
            return textWriter.close();
        }
    };
}());


onPrefOpen = tab => {

    tab.on("ready", function (aTab) {

        var worker = tab.attach({
            contentScriptFile: "./prefs/content-script.js",
            contentScriptOptions: {
                debug: debug,
                features: featuresToCount
            }
        });

        worker.port.on("pref-page-request-features-update", function () {

            var allFeatures = featuresModel.all(),
                featureStats;

            featureStats = Object.keys(allFeatures).map(function (aFeatureName) {

                var featureRule = eval("[" + allFeatures[aFeatureName] + "]")[0];

                return {
                    feature: aFeatureName,
                    type: featureRule.type,
                    count: statsModel.numObservations(aFeatureName) || 0,
                    domainCount: statsModel.numDomains(aFeatureName) || 0
                };
            });

            worker.port.emit("pref-page-receive-features-update", featureStats);
        });

        worker.port.on("pref-page-request-delete-feature", function (featureName) {
            var featureRuleWasDeleted = featuresModel.clearOne(featureName);
            statsModel.clearOne(featureName);
            worker.port.emit("pref-page-receive-delete-feature", [featureName, featureRuleWasDeleted]);
        });

        worker.port.on("pref-page-request-add-features", function (featuresText) {

            var badRules = featuresText.split("\n").filter(function (aFeatureRule) {
                var wasSuccessfullyAdded = featuresModel.add(aFeatureRule.trim());
                return wasSuccessfullyAdded ? false : aFeatureRule;
            });

            worker.port.emit("pref-page-receive-add-features", badRules);
        });
    });
};


pageMod.PageMod({
    include: "*",
    exclude: "*/prefs/index.html",
    contentScriptOptions: {
        debug: debug
    },
    contentScriptFile: [
        "./content/debug.js",
        "./content/features.js",
        "./content/instrument.js"
    ],
    contentScriptWhen: "start",
    attachTo: ['top', 'frame'],
    onAttach: function (worker) {

        worker.port.on("content-request-recorded-data", function (featureData) {
            fileWriter.write(featureData);
        });

        worker.port.on("content-request-record-feature-block", function (featureDetails) {
            var {featureName, domain} = featureDetails;
            statsModel.addObservation(featureName, domain);
        });
    }
});


buttons.ActionButton({
    id: "feature-measurement",
    label: "Feature Measurement Study",
    icon: {
        "16": "./icons/icon-16.png",
        "32": "./icons/icon-32.png",
        "64": "./icons/icon-64.png"
    },
    onClick: state => {
        tabs.open({
            url: "./prefs/index.html",
            onOpen: onPrefOpen
        });
    }
});
