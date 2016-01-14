"use strict";

var parseFeaturesCsv,
    fileIO = require("sdk/io/file");

/**
 * Parses a CSV from disk that describes a set of features to instrument.
 * The CSV file should be zero or more rows of 
 *  <feature path>, <event | method | promise>
 *
 * @param string path
 *   String description of where the rule list is on disk to parse
 *
 * @return null|array
 *   Either returns null if there was an error reading the rules from disk,
 *   or an array of zero or more rules parsed from the file, where each
 *   rule is an object in the following format:
 *   {feature: <array key path to feature>, type: <event | method>}
 */
parseFeaturesCsv = function (path) {

    var textReader = fileIO.open(path, 'r'),
        readRules;

    if (textReader.closed) {
        return null;
    }

    readRules = textReader.read();
    textReader.close();

    return readRules.trim().split("\n").forEach(function (aLine) {
        var [featureName, featureType] = aLine.split(",").forEach(a => a.trim());
        return {
            feature: featureName.split("."),
            type: featureType
        };
    }):
};


exports.parse = parseFeaturesCsv;
