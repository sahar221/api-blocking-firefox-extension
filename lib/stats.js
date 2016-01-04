"use strict";

var simpleStorage = require("sdk/simple-storage"),
    statsForFeature;


/**
 * Private helper function used to extract statistics about a given feature
 * from the internal storage system.
 *
 * @param string feature
 *   The keypath describing a feature, ex Document.prototype.getElementById
 *
 * @return object
 *   Either an object giving the internal storage representation of the
 *   feature's statistics, or undefined if there are no statistics captured
 *   for a given feature.
 */
statsForFeature = function (feature) {

    var statsStore;

    if (!simpleStorage.storage.stats) {
        return undefined;
    }

    statsStore = simpleStorage.storage.stats;

    if (!statsStore[feature]) {
        return undefined;
    }

    return statsStore[feature];
};


/**
 * Clears out all information currently stored about how often features are
 * used.  Resets the stats on all features to zero.
 *
 * @return object
 *   A reference to the current module object
 */
exports.clearAll = function () {
    simpleStorage.storage.stats = {};
    return this;
};


/**
 * Deletes all statistics recorded for a given feature, if any exist.
 *
 * @param string feature
 *   The keypath describing a feature, ex Document.prototype.getElementById
 *
 * @return boolean
 *   Returns true if there were statistics recorded about a given feature that
 *   were deleted, and otherwise false (if no changes were made).
 */
exports.clearOne = feature => {

    if (!simpleStorage.storage.stats) {
        return false;
    }

    if (simpleStorage.storage.stats[feature] === undefined) {
        return false;
    }

    delete simpleStorage.storage.stats[feature];
    return true;
};


/**
 * Adds that a feature was observed in a website.
 *
 * @param string featureName
 *   The keypath describing a feature, ex Document.prototype.getElementById
 * @param string domain
 *   The domain that the feature was observed on
 *
 * @return object
 *   A reference to the current module object.
 */
exports.addObservation = function (featureName, domain) {

    var statsStore;

    if (!simpleStorage.storage.stats) {
        simpleStorage.storage.stats = {};
    }

    statsStore = simpleStorage.storage.stats;

    if (!statsStore[featureName]) {
        statsStore[featureName] = {
            count: 0,
            domainCount: 0,
            domains: {}
        };
    }

    statsStore[featureName].count += 1;

    if (!statsStore[featureName].domains[domain]) {
        statsStore[featureName].domains[domain] = true;
        statsStore[featureName].domainCount += 1;
    }

    return this;
};


/**
 * Returns a description of the number of domains the given feature has
 * been observed on.
 *
 * @param string feature
 *   The keypath describing a feature, ex Document.prototype.getElementById
 *
 * @return Number
 *   An integer number of the distinct domains that the feature has been
 *   observed on.
 */
exports.numDomains = function (feature) {

    var stats = statsForFeature(feature);
    return stats && stats.domainCount;
};


/**
 * Returns the number of times the given feature has been observed.
 *
 * @param string feature
 *   The keypath describing a feature, ex Document.prototype.getElementById
 *
 * @return Number
 *   An integer number of the times a given feature has been observed so far.
 */
exports.numObservations = function (feature) {
    var stats = statsForFeature(feature);
    return stats && stats.count;
};

