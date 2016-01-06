"use strict";

var debug = true,
    pageMod = require("sdk/page-mod"),
    buttons = require('sdk/ui/button/action'),
    tabs = require("sdk/tabs"),
    featuresModel = require("lib/features"),
    statsModel = require("lib/stats"),
    {Cc, Ci, Cu} = require("chrome"),
    onPrefOpen;


onPrefOpen = tab => {

    tab.on("ready", function (aTab) {

        var worker = tab.attach({
            contentScriptFile: "./prefs/content-script.js",
            contentScriptOptions: {
                debug: debug
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
//    exclude: "*/prefs/index.html",
    contentScriptOptions: {
        debug: debug
    },
    contentScriptFile: [
        "./content/debug.js",
        "./content/features.js",
        "./content/instrument.js"
    ],
    contentScriptWhen: "start",
    onAttach: worker => {

        worker.port.on("content-request-existing-rules", () => {
            worker.port.emit("content-receive-existing-rules", featuresModel.all());
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
