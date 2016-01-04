(function () {
    "use strict";

    var uicGlobal = window.UICGLOBAL,
        pageWindow = unsafeWindow,
        origFeatures = {},
        instrumentMethod,
        instrumentPropertySet,
        instrumentEventRegistration,
        instrumentPromise,
        featureRefFromPath,
        isFeatureAllowed,
        returnInertValue,
        instrumentTheDom,
        cloneIntoDom,
        domHasBeenInstrumented = false;

    cloneIntoDom = function (targetRef, name, func) {
        targetRef[name] = cloneInto(func, unsafeWindow, {
            cloneFunctions: true,
            wrapReflectors: true
        });
    };

    /**
     * Checks to see if a decision has already been made about about a given
     * feature, locally, w/o calling back to the main plugin code.
     *
     * @param object featureRule
     *   An object defining a property in the DOM that should be instrumented,
     *   and what the return values should be.
     *
     * @return boolean
     *   Returns a boolean description of whether the given feature has been
     *   blocked.
     */
    isFeatureAllowed = function (featureRule) {

        var featureName = featureRule.feature,
            featureKeyPath = Array.isArray(featureName) ? featureName.join(".") : featureName;

        uicGlobal.debug(featureKeyPath + ": Checking if feature is blocked");

        if (!uicGlobal.features[featureKeyPath]) {
            uicGlobal.debug(featureKeyPath + ": allowed");
            return false;
        }

        self.port.emit("content-request-record-feature-block", {
            featureName: featureKeyPath,
            domain: unsafeWindow.location.host
        });
        uicGlobal.debug(featureKeyPath + ": blocked");
        return true;
    };


    /**
     * Takes a global DOM object and a path to look up on that object, and returns
     * either information about where to access that object in the DOM, or
     * null if it couldn't be found.
     *
     * @param array path
     *   An array of strings, representing a key path to look up in the DOM
     *   to find a feature's implementation.
     *
     * @return array|null
     *   If we're able to find the feature reference, an array of length three
     *   is returned: [featureRef, featureLeafName, parentRef].  Otherwise, null
     *   is returned.
     */
    featureRefFromPath = function (path) {

        var currentLeaf = unsafeWindow,
            items;

        items = path.map(function (pathPart) {

            var prevLeaf = currentLeaf;

            if (currentLeaf === null || currentLeaf[pathPart] === undefined) {
                return null;
            }

            currentLeaf = prevLeaf[pathPart];
            return [currentLeaf, pathPart, prevLeaf];
        });

        return items[items.length - 1];
    };


    /**
     * Calculates the default, inert value that should be returned for a feature
     * and returns is.
     *
     * @param string type
     *   One of the following strings, which determines how the following rule
     *   should be processed: "literal", "instance", "reference", "invocation",
     *   "call"
     * @param mixed rule
     *   Can be either an array of strings, defining a key path that should
     *   be looked up in the DOM, or a literal value that should be returned.
     *
     * @return mixed
     *   Returns the return value described by type and rule, or throws an
     *   exception if the given type was of an unexpected value.
     */
    returnInertValue = function (type, rule) {

        var featureLookupResult,

            funcToCallPath, // Parameters that are used only for describing
            thisToCallPath, // what features should be invoked when the return
            callArgs,       // type is "call"
            origFeatureToCall,
            thisToCallFeatureLookupResult;

        switch (type) {
            case "call":
                [funcToCallPath, thisToCallPath, callArgs] = rule;

                // First, check to see if the function we should call has
                // been modified (in which case we need to use the stored,
                // original reference, and not the current reference in the
                // standard DOM location.
                origFeatureToCall = origFeatures[funcToCallPath.join(".")];
                if (origFeatureToCall) {

                    featureLookupResult = origFeatureToCall;

                } else {

                    featureLookupResult = featureRefFromPath(funcToCallPath);
                    if (featureLookupResult === null) {
                        throw "Unable to find a referenced feature " + funcToCallPath.join(".") + " to call to generate an inert value (call).";
                    }

                    origFeatureToCall = featureLookupResult[0];
                }

                thisToCallFeatureLookupResult = featureRefFromPath(thisToCallPath);
                if (thisToCallFeatureLookupResult === null) {
                    throw "Unable to find object to call as the this parameter for path " + thisToCallPath.join(".") + " to use when generate an inert value (call).";
                }

                return origFeatureToCall.apply(thisToCallFeatureLookupResult[0], callArgs);
                break;

            case "literal":
                return rule;
                break;

            case "reference":
                featureLookupResult = featureRefFromPath(rule);
                if (featureLookupResult === null) {
                    throw "Unable to find a referenced feature " + rule.join(".") + " as an inert return value (reference).";
                }
                return featureLookupResult[0];
                break;

            case "instance":
                featureLookupResult = featureRefFromPath(rule);
                if (featureLookupResult === null) {
                    throw "Unable to find a referenced feature " + rule.join(".") + " as an inert return value (instance).";
                }
                return new featureLookupResult[0]();
                break;

            case "invocation":
                featureLookupResult = featureRefFromPath(rule);
                if (featureLookupResult === null) {
                    throw "Unable to find a referenced feature " + rule.join(".") + " as an inert return value (invocation).";
                }
                return featureLookupResult[0]();
                break;

            default:
                throw "Unexpected return type: " + type;
                break;
        }
    };


    /**
     * Instruments a property defined in the DOM so that setting a value to
     * the property can be intercepted and prevented if the user desires.
     *
     * @param object featureRule
     *   An object defining a property in the DOM that should be instrumented,
     *   and what the return values should be.  The given object should include
     *   a key path array at `featureRule.feature`.
     * @param function func
     *   A function that will be called with two arguments, the given featureRule,
     *   and the reference to that feature.  The function should return
     *   true or false, describing whether the property set should be allowed.
     *
     * @return boolean
     *   True if the given property was instrumented, and false if
     *   there was any error.
     */
    instrumentPropertySet = function (featureRule, func) {

        var featurePath = featureRule.feature,
            featureLookupResult = featureRefFromPath(featurePath),
            featureName = featurePath.join("."),
            featureRef,
            featureLeafName,
            parentRef;

        uicGlobal.debug(featureName + ": Debugging property setting feature");

        if (featureLookupResult === null) {
            console.log("Unable to find feature for property rule: " + featureName);
            return false;
        }

        [featureRef, featureLeafName, parentRef] = featureLookupResult;

        parentRef.watch(featureLeafName, (id, oldval, newval) => {
            return func(featureRule) ? newval : oldval;
        });

        return true;
    };


    /**
     * Instruments a method defined in the DOM so that it will only fire if
     * a given function returns true, and otherwise an inert, hardcoded value
     * will be returned.
     *
     * @param object methodRule
     *   An object defining a method in the DOM that should be instrumented,
     *   and what the return values should be.  The given object should include
     *   a key path array at `methodRule.feature`, and an array defining a
     *   return value at `methodRule.return`.
     * @param function func
     *   A function that will be called with two arguments, the given methodRule,
     *   and the reference to that feature.  The function should return
     *   true or false, describing whether the original version of the function
     *   should be called.
     *
     * @return boolean
     *   True if the given method feature was instrumented, and false if
     *   there was any error.
     */
    instrumentMethod = function (methodRule, func) {

        var featurePath = methodRule.feature,
            featureLookupResult = featureRefFromPath(featurePath),
            featureName = featurePath.join("."),
            featureRef,
            featureLeafName,
            parentRef;

        uicGlobal.debug(featureName + ": Instumenting method feature");

        if (featureLookupResult === null) {
            uicGlobal.debug("Unable to find feature for method rule: " + featureName);
            return false;
        }

        [featureRef, featureLeafName, parentRef] = featureLookupResult;

        origFeatures[featureName] = featureRef;

        parentRef[featureLeafName] = function () {

            var shouldBlock = func(methodRule),
                returnRuleType,
                returnRuleValue;

            if (!shouldBlock) {
                return featureRef.apply(this, arguments);
            }

            [returnRuleType, returnRuleValue] = methodRule.return;
            return returnInertValue(returnRuleType, returnRuleValue);
        };
        cloneIntoDom(parentRef, featureLeafName, parentRef[featureLeafName]);
        parentRef[featureLeafName].isAltered = true;

        return true;
    };


    /**
     * Instruments registering for an event registration so that whether
     * an event registration is allowed is controlled by a given callback
     * function.
     *
     * @param object eventRule
     *   An object defining a method in the DOM that should be instrumented,
     *   and what the return values should be.  The given object should include
     *   the name of the event in `eventRule.feature`.
     * @param function func
     *   A function that will be called with two arguments, the given eventRule,
     *   and the reference to that feature.  The function should return
     *   true or false, describing whether the original version of the function
     *   should be called.
     *
     * @return boolean
     *   True if the given event feature was instrumented method, and false if
     *   there was any error.
     */
    instrumentEventRegistration = (function () {

        var origEventListener,
            approvedEvents = {};

        return function (eventRule, func) {

            var eventName = eventRule.feature,
                shouldRegister;

            uicGlobal.debug(eventName + ": Instumenting event");

            // Check and see if we've already replace the original event listener.
            // If not, replace the original event listener with the new one now.
            if (origEventListener === undefined) {
                origEventListener = unsafeWindow.EventTarget.prototype.addEventListener;
                unsafeWindow.EventTarget.prototype.addEventListener = function () {
                    if (approvedEvents[eventName] === undefined) {
                        return;
                    }
                    return origEventListener.apply(this, arguments);
                };
            }

            shouldRegister = func(eventRule);
            if (shouldRegister) {
                approvedEvents[eventName] = true;
            }
            return true;
        };
    }());


    /**
     * Instruments a method that returns a promise, so that the instrumented
     * method either returns the original promise defined in the feature's spec,
     * or an empty promise that does nothing.
     *
     * @param object promiseRule
     *   An object defining a method in the DOM that should be instrumented
     *   The given object should include the name of the event in
     *   `promiseRule.feature`.
     * @param function func
     *   A function that will be called with two arguments, the given promiseRule,
     *   and a reference to that feature.  The function should return
     *   true or false, describing whether the original version of the function
     *   should be called.
     *
     * @return boolean
     *   True if the given event feature was instrumented method, and false if
     *   there was any error.
     */
    instrumentPromise = function (promiseRule, func) {

        var featurePath = promiseRule.feature,
            featureLookupResult = featureRefFromPath(featurePath),
            featureName = Array.isArray(featurePath) ? featurePath.join(".") : featurePath,
            featureRef,
            featureLeafName,
            parentRef;

        uicGlobal.debug(featureName + ": Instrumenting promise feature");

        if (featureLookupResult === null) {
            console.log("Unable to find feature for promise rule: " + featureName);
            return false;
        }

        [featureRef, featureLeafName, parentRef] = featureLookupResult;

        origFeatures[featureName] = featureRef;

        parentRef[featureLeafName] = function () {

            var shouldCall = func(methodRule),
                returnRuleType,
                returnRuleValue;

            if (shouldCall) {
                return featureRef.apply(this, arguments);
            }

            return new unsafeWindow.Promise(function (resolve, reject) {
                reject("The '" + featurePath.join(".") + "' feature has been disabled.");
            });
        };
    };


    uicGlobal.instrumentTheDom = function () {

        if (domHasBeenInstrumented) {
            return;
        }

        domHasBeenInstrumented = true;
        uicGlobal.debug("Beginning to instrumenting the DOM");

        Object.keys(uicGlobal.features).forEach(function (aFeature) {
            var featureRule = uicGlobal.features[aFeature];
            switch (featureRule.type) {
                case "method":
                    instrumentMethod(featureRule, isFeatureAllowed);
                    break;

                case "event":
                    instrumentEventRegistration(featureRule, isFeatureAllowed);
                    break;

                case "property":
                    instrumentPropertySet(featureRule, isFeatureAllowed);
                    break;

                case "promise":
                    instrumentPromise(featureRule, isFeatureAllowed);
                    break;
            }
        });
    };

    if (uicGlobal.featuresLoaded === true) {
        uicGlobal.instrumentTheDom();
    }
}());
