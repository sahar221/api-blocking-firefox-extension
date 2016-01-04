"use strict";


var simpleStorage = require("sdk/simple-storage"),
    knownFeatureTypes = ["property", "event", "method", "promise"];


/**
 * Removes all persistent information about what features are currently set
 * to be intercepted.
 *
 * @return object
 *   A reference to the current module object.
 */
exports.clearAll = function () {
    simpleStorage.storage.features = {};
    return this;
};


/**
 * Deletes all feature rule information for a given feature.
 *
 * @param string feature
 *   The keypath describing a feature, ex Document.prototype.getElementById
 *
 * @return boolean
 *   Returns true if there was a rule recorded about a given feature that
 *   were deleted, and otherwise false (if no changes were made).
 */
exports.clearOne = featureName => {

    if (!simpleStorage.storage.features) {
        return false;
    }

    if (simpleStorage.storage.features[featureName] === undefined) {
        return false;
    }

    delete simpleStorage.storage.features[featureName];
    return true;
};


/**
 * Returns a description of all features currently stored in the system
 * for interception.
 *
 * @return object
 *   An object mapping feature key paths (ex
 *   "Document.prototype.getElementById") to strings describing feature
 *   interception rules.
 */
exports.all = function () {
    return simpleStorage.storage.features || {};
};


/**
 * Adds a feature to the set of features that should be intercepted.
 *
 * Note that these rules are stored as strings because they include some
 * objects that are not serializeable in JSON or in the simple storage
 * API's * storage object.
 *
 * @param string featureDesc
 *   A string depicting a javascript object that describes a complete feature
 *   rule.
 *
 * @return boolean
 *   true if the given feature description could be parsed and was added
 *   to the rule set, and false in all other cases.
 */
exports.add = function (featureDesc) {

    // First attempt to decode the feature rule, as a first test to see
    // if it appears valid.
    var parsedRule,
        featureKeyPath;

    try {
        parsedRule = eval("[" + featureDesc + "]");
    }
    catch (e) {
        return false;
    }

    if (!parsedRule || parsedRule.length === 0) {
        return false;
    }
    parsedRule = parsedRule[0];

    // Next check and see if there is a key path in the feature description
    // that we can key onto.
    if (!parsedRule.feature === undefined) {
        return false;
    }
    featureKeyPath = Array.isArray(parsedRule.feature) ? parsedRule.feature.join(".") : parsedRule.feature;

    // Next, also check and make sure that the type of the feature being
    // instrumented is know and understood
    if (knownFeatureTypes.indexOf(parsedRule.type) === -1) {
        return false;
    }

    // Otherwise, looks good, so add the rule to the stored feature rules.
    if (!simpleStorage.storage.features) {
        simpleStorage.storage.features = {};
    }

    simpleStorage.storage.features[featureKeyPath] = featureDesc;
    return true;
};

