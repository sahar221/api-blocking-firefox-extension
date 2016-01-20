(function () {
    "use strict";

    var global = window.UICGLOBAL,
        reportBlockedFeatures,
        reportFoundHrefs,
        domHasBeenInstrumented = false;

    global.script.secPerPage = self.options.secPerPage;

    reportBlockedFeatures = function (features) {
        self.port.emit("content-request-record-blocked-features", {
            features: features,
            url: unsafeWindow.location.toString()
        });
    };
    global.script.reportBlockedFeatures = exportFunction(reportBlockedFeatures, unsafeWindow, {
        allowCrossOriginArguments: true
    });


    /**
     * Reports a list of urls (relative or absolute) that are referenced
     * from the current page to the extension
     *
     * @param array urls
     *   An array of zero or more urls (as strings) describing pages referenced
     *   from the current page.
     */
    reportFoundHrefs = function (urls) {

        // First make sure all the URLs are unique before we report them
        // to the extension.
        var uniqueUrls = urls.reduce(function (prev, cur) {
            prev[cur] = true;
            return prev;
        }, Object.create(null));

        uniqueUrls = Object.keys(uniqueUrls);
        global.debug("Found " + uniqueUrls.length + " urls referenced in a elements on this page");
        self.port.emit("content-request-found-urls", uniqueUrls);
    };
    global.script.reportFoundHrefs = exportFunction(reportFoundHrefs, unsafeWindow, {
        allowCrossOriginArguments: true
    });


    global.instrumentTheDom = function () {

        if (domHasBeenInstrumented) {
            return;
        }

        global.debug("Beginning to instrumenting the DOM");

        unsafeWindow.eval(`(function () {

            var featureRefFromPath,
                recordBlockedFeature,
                recordedFeatures = {},
                instrumentMethod,
                instrumentPropertySet,
                featureTypeToFuncMap,
                origQuerySelectorAll = window.document.querySelectorAll,
                origSetTimeout = window.setTimeout;


            recordBlockedFeature = function (featureName) {

                featureName = Array.isArray(featureName) ? featureName.join(".") : featureName;

                if (recordedFeatures[featureName] === undefined) {
                    recordedFeatures[featureName] = 1;
                } else {
                    recordedFeatures[featureName] += 1;
                }
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
                    recordBlockedFeature(propertyPath);
                    return newval;
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
                    recordBlockedFeature(methodPath);
                    return featureRef.apply(this, arguments);
                };

                return true;
            };

            featureTypeToFuncMap = {
                "method": instrumentMethod,
                "promise": instrumentMethod,
                "property": instrumentPropertySet
            };

            Object.keys(UICGLOBAL.features).forEach(function (featureType) {
                UICGLOBAL.features[featureType].forEach(function (featurePath) {
                    featureTypeToFuncMap[featureType](featurePath);
                });
            });

            // If we're a top level document (ie not an iframe), then
            // we want to register to let the extension know when we're
            // fully loaded so that we can open some of them programatically.
            if (window !== window.top) {
                return;
            }

            document.addEventListener("DOMContentLoaded", function (event) {
                origSetTimeout(function () {
                    var anchorTags = origQuerySelectorAll.call(document, "a[href]"),
                        hrefs = Array.prototype.map.call(anchorTags, a => a.href);
                    UICGLOBAL.reportBlockedFeatures(recordedFeatures);
                    UICGLOBAL.reportFoundHrefs(hrefs);
                }, UICGLOBAL.secPerPage * 1000);
            });

        }())`);
        domHasBeenInstrumented = true;
    };

    if (global.featuresLoaded === true) {
        global.instrumentTheDom();
    }
}());
