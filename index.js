"use strict";

var debug = false,
    timers = require("sdk/timers"),
    pageMod = require("sdk/page-mod"),
    tabs = require("sdk/tabs"),
    system = require("sdk/system"),
    fileIO = require("sdk/io/file"),
    events = require("sdk/system/events"),
    featuresModel = require("lib/features"),
    statsModel = require("lib/stats"),
    featuresRuleParser = require("lib/featureParser"),
    featuresToCount = featuresRuleParser.parse("features-less.csv"),
    passedArguments = system.staticArgs || {},
    currentProcessFeatures,
    fileWriter;


currentProcessFeatures = (function () {

    var domainToFeatures = {};

    return {
        add: function (domain, feature) {
            if (domainToFeatures[domain] === undefined) {
                domainToFeatures[domain] = {};
            }

            if (domainToFeatures[domain][feature] === undefined) {
                domainToFeatures[domain][feature] = 1;
            } else {
                domainToFeatures[domain][feature] += 1;
            }

            return this;
        },
        getAll: function () {
            return domainToFeatures;
        }
    };
}());


fileWriter = (function () {
    var outputPath = passedArguments.output,
        toStdout = false,
        textWriter;

    if (outputPath === undefined) {
        // "Firefox opened without specifiying a path to write feature data to.  Should be called with something like `--static-args={output: '/tmp/out'}.";
        toStdout = true;
    } else {
        textWriter = fileIO.open(outputPath, "w");
        if (!textWriter.closed) {
            throw "Unable to open file to write to at '" + outputPath + "'.";
        }
    }

    return {
        write: function (data) {
            if (toStdout) {
                console.log(JSON.stringify(data) + "\n");
            } else {
                return textWriter.write(JSON.stringify(data) + "\n");
            }
        },
        close: function () {
            if (!toStdout) {
                return textWriter.close();
            }
        }
    };
}());


pageMod.PageMod({
    include: "*",
    contentScriptOptions: {
        debug: debug,
        features: featuresToCount
    },
    contentScriptFile: [
        "./content/debug.js",
        "./content/features.js",
        "./content/instrument.js"
    ],
    contentScriptWhen: "start",
    attachTo: ['top', 'frame'],
    onAttach: function (worker) {
        worker.port.on("content-request-record-feature-block", function (featureDetails) {
            var {featureName, domain} = featureDetails;
            //statsModel.addObservation(featureName, domain);
            currentProcessFeatures.add(domain, featureName);
        });
    }
});


events.on("xpcom-will-shutdown", function (data) {
    console.log("quitting");
    fileWriter.write(currentProcessFeatures.getAll());
    fileWriter.close();
});


// If we were passed a timeout at start in the --static-args JSON text,
// then set the browser to shutdown programatically.
if (true || passedArguments.time) {

    timers.setTimeout(function () {
        fileWriter.write(currentProcessFeatures.getAll());
        fileWriter.close();
        system.exit(0);
    }, 60000);// passedArguments.time * 1000);
}

