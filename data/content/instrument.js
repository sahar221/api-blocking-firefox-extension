(function () {
    "use strict";

    var global = window.UICGLOBAL,
        recordBlockedFeature,
        domHasBeenInstrumented = false;

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
    recordBlockedFeature = function (featureName) {

        featureName = Array.isArray(featureName) ? featureName.join(".") : featureName;
        global.debug(featureName + ": Trapped blocked feature");

        self.port.emit("content-request-record-feature-block", {
            featureName: featureName,
            domain: unsafeWindow.location.host
        });

        return true;
    };
    global.script.recordBlockedFeature = exportFunction(recordBlockedFeature, unsafeWindow, {
        allowCrossOriginArguments: true
    });


    global.instrumentTheDom = function () {

        if (domHasBeenInstrumented) {
            return;
        }

        global.debug("Beginning to instrumenting the DOM");

        unsafeWindow.eval(`(function () {

            var allPurposeProxy,
                featureRefFromPath,
                instrumentMethod,
                instrumentEventRegistration,
                instrumentPropertySet,
                featureTypeToFuncMap;

            allPurposeProxy = new Proxy(function () {}, {
                get: function (target, property, receiver) {
                    if (property === "length") {
                        return 0;
                    }
                    return allPurposeProxy;
                },
                set: function (target, property, value, receiver) {
                    return allPurposeProxy;
                },
                apply: function (target, thisArg, argumentsList) {
                    return allPurposeProxy;
                },
                enumerate: function (target) {
                    return [][Symbol.iterator]();
                },
                ownKeys: function (target) {
                    return [];
                }
            });


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

                var currentLeaf = window,
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
             * Instruments a property defined in the DOM so that setting a value to
             * the property can be intercepted and prevented if the user desires.
             *
             * @param array propertyPath
             *   An array describing the key path of the feature to be watched and
             *   blocked.
             *
             * @return boolean
             *   True if the given property was instrumented, and false if
             *   there was any error.
             */
            instrumentPropertySet = function (propertyPath) {

                var propertyLookupResult = featureRefFromPath(propertyPath),
                    propertyName = propertyPath.join("."),
                    propertyRef,
                    propertyLeafName,
                    propertyParentRef;

                UICGLOBAL.debug(propertyName + ": Debugging property setting feature");

                if (propertyLookupResult === null) {
                    UICGLOBAL.debug("Unable to find feature for property rule: " + featureName);
                    return false;
                }

                [propertyRef, propertyLeafName, propertyParentRef] = propertyLookupResult;
                propertyParentRef.watch(propertyLeafName, function (id, oldval, newval) {
                    UICGLOBAL.recordBlockedFeature(propertyPath);
                    return oldval;
                });

                return true;
            };


            /**
            * Instruments a method defined in the DOM so that it will only fire if
            * a given function returns true, and otherwise an inert, hardcoded value
            * will be returned.
            *
            * @param array methodPath
            *   A key path pointing to the feature in the DOM that should be
            *   instrumented.
            *
            * @return boolean
            *   True if the given method feature was instrumented, and false if
            *   there was any error.
            */
            instrumentMethod = function (methodPath) {

                var methodLookupResult = featureRefFromPath(methodPath),
                    methodName = methodPath.join("."),
                    featureRef,
                    featureLeafName,
                    parentRef;

                if (methodLookupResult === null) {
                    UICGLOBAL.debug("Unable to find feature for method rule: " + methodName);
                    return false;
                }

                [featureRef, featureLeafName, parentRef] = methodLookupResult;
                parentRef[featureLeafName] = function () {
                    UICGLOBAL.recordBlockedFeature(methodPath);
                    return allPurposeProxy;
                };

                return true;
            };


            /**
             * Instruments registering for an event registration so that whether
             * an event registration is allowed is controlled by a given callback
             * function.
             *
             * @param string eventName
             *   The name of the event being registered.
             *
             * @return boolean
             *   True if the given event feature was instrumented method, and false if
             *   there was any error.
             */
            instrumentEventRegistration = (function () {

                var origEventListener,
                    eventsToBlock = {};

                return function (eventName) {

                    UICGLOBAL.debug(eventName + ": Instumenting event");

                    // Check and see if we've already replace the original event listener.
                    // If not, replace the original event listener with the new one now.
                    if (origEventListener === undefined) {
                        origEventListener = window.EventTarget.prototype.addEventListener;
                        window.EventTarget.prototype.addEventListener = function () {
                            if (eventsToBlock[eventName] === true) {
                                UICGLOBAL.recordBlockedFeature(eventName);
                                return;
                            }
                            return origEventListener.apply(this, arguments);
                        };
                    }

                    eventsToBlock[eventName] = true;
                    return true;
                };
            }());


            featureTypeToFuncMap = {
                "method": instrumentMethod,
                "promise": instrumentMethod,
                "event": instrumentEventRegistration,
                "property": instrumentPropertySet
            };


            Object.keys(UICGLOBAL.features).forEach(function (featureType) {
                UICGLOBAL.features[featureType].forEach(function (featurePath) {
                    featureTypeToFuncMap[featureType](featurePath);
                });
            });
        }())`);
        domHasBeenInstrumented = true;
    };

    if (global.featuresLoaded === true) {
        global.instrumentTheDom();
    }
}());
