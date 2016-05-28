(function () {
    "use strict";

    var global = window.UICGLOBAL,
        reportUsedFeatures,
        reportFoundUrls,
        reportPerformanceNumbers,
        reportJavascript,
        isForIFrame = !!self.options.isForIFrame,
        startTime;

    global.script.secPerPage = self.options.secPerPage;
    global.script.manualMode = self.options.manual;
    global.script.performance = self.options.performance;
    global.script.jsReport = self.options.jsReport;

    if (self.options.performance) {
        startTime = Date.now();
        reportPerformanceNumbers = function (pageMeasures) {
            self.port.emit("content-request-performance-numbers", {
                startTime: startTime,
                instrumentStartTime: pageMeasures.instrumentStartTime,
                instrumentEndTime: pageMeasures.instrumentEndTime,
                domReadyTime: pageMeasures.domReadyTime,
                modificationStartTime: pageMeasures.modificationStartTime,
                modificationEndTime: pageMeasures.modificationEndTime,
                finishedTimeTime: Date.now()
            });
        };
        global.script.reportPerformanceNumbers = exportFunction(reportPerformanceNumbers, unsafeWindow, {
            allowCrossOriginArguments: true
        });
    }


    reportUsedFeatures = function (features, featureTimeline) {

        self.port.emit("content-request-record-used-features", {
            features: features,
            timeline: null, // coallecedTimeline[0],
            url: unsafeWindow.location.toString.call(unsafeWindow.location)
        });
    };
    global.script.reportUsedFeatures = exportFunction(reportUsedFeatures, unsafeWindow, {
        allowCrossOriginArguments: true
    });


    reportJavascript = function (jsData) {
        self.port.emit("content-request-record-javascript", {
            javacript: jsData,
            url: unsafeWindow.location.toString.call(unsafeWindow.location)
        });
    };
    global.script.reportJavascript = exportFunction(reportJavascript, unsafeWindow, {
        allowCrossOriginArguments: true
    });


    /**
     * Reports a list of urls (relative or absolute) that are referenced
     * from the current page to the extension
     *
     * @param array activatedUrls
     *   An array of zero or more strings representing URLs that have been
     *   clicked on or requested by the page.  The elements of the array
     *   are sorted by number of times the page tried to request them
     *   (from most to least)
     * @param array allUrls
     *   An array of zero or more urls (as strings) describing pages referenced
     *   from the current page.
     */
    reportFoundUrls = function (activatedUrls, allUrls) {

        // First make sure all the URLs are unique before we report them
        // to the extension, and that we don't include URLs in the
        // "non-activated" array that were already included in the
        // `activatedUrls` array.
        var nonActivatedUrls = allUrls.reduce(function (prev, cur) {
            if (activatedUrls.indexOf(cur) !== -1) {
                return prev;
            }
            prev[cur] = true;
            return prev;
        }, Object.create(null));

        nonActivatedUrls = Object.keys(nonActivatedUrls);
        global.debug("Found " + nonActivatedUrls.length + " urls referenced in a elements on this page");
        self.port.emit("content-request-found-urls", [activatedUrls, nonActivatedUrls]);
    };
    global.script.reportFoundUrls = exportFunction(reportFoundUrls, unsafeWindow, {
        allowCrossOriginArguments: true
    });

    if (self.options.gremlinSource) {
        unsafeWindow.eval(self.options.gremlinSource);
    }

    unsafeWindow.eval(`(function () {

        var eventLoopTurnIndex = 0,
            eventLoopTickerCallback,
            featureRefFromPath,
            recordUsedFeature,
            recordedFeatures = {},
            instrumentMethod,
            instrumentPropertySet,
            featureTypeToFuncMap,
            origRequestAnimationFrame = window.requestAnimationFrame,
            origGetElementsByTagName = window.document.getElementsByTagName,
            origQuerySelectorAll = window.document.querySelectorAll,
            origSetTimeout = window.setTimeout,
            origAddEventListener = window.Node.prototype.addEventListener,
            origUrlToString = window.URL.prototype.toString,
            currentLocationString = window.location.toString(),
            isUrlOnCurrentPage,
            requestedUrls,
            parseStringToUrl,
            sharedAnchorEventListiner,
            onLocationChange,
            documentObserver,
            allPurposeProxy,
            domModificationPerformanceCallback,
            numFeaturesSeen = 0,
            featureTimeline = [],
            performanceTimes = {};


        eventLoopTickerCallback = function () {
            eventLoopTurnIndex += 1;
            origRequestAnimationFrame.call(window, eventLoopTickerCallback);
        };
        eventLoopTickerCallback();


        if (UICGLOBAL.performance) {
            domModificationPerformanceCallback = function () {
                performanceTimes.modificationStartTime = Date.now();
                var i = 0,
                    bodyElm = document.body,
                    testDivElm = document.createElement("DIV");

                testDivElm.innerHTML = "Test DIV";

                for (i; i < 1000000; i += 1) {
                    bodyElm.appendChild(testDivElm);
                    bodyElm.removeChild(testDivElm);
                }
                performanceTimes.modificationEndTime = Date.now();
                UICGLOBAL.reportPerformanceNumbers(performanceTimes);
            };

            origAddEventListener.call(window, "DOMContentLoaded", function (event) {
                performanceTimes.domReadyTime = Date.now();
                domModificationPerformanceCallback();
            });

            if (UICGLOBAL.performance === "c") {
                return;
            }

            performanceTimes.instrumentStartTime = Date.now();
        }


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


        parseStringToUrl = function (aUrlString) {
            return new window.URL(aUrlString, currentLocationString);
        };


        isUrlOnCurrentPage = (function () {
            var curPageUrl = parseStringToUrl(currentLocationString);
            return function (aUrlString) {
                var newUrl = parseStringToUrl(aUrlString),
                    urlsAreSimilar = (newUrl.host === curPageUrl.host &&
                        newUrl.pathname === curPageUrl.pathname &&
                        newUrl.search === curPageUrl.search);
                return urlsAreSimilar;
            };
        }());


        requestedUrls = (function () {

            var urls = {};

            return {
                add: function (aUrl) {
                    var newUrl = parseStringToUrl(aUrl);
                    if (urls[newUrl] === undefined) {
                        urls[newUrl] = 1;
                    } else {
                        urls[newUrl] += 1;
                    }
                    return this;
                },
                all: function () {
                    var flattenedUrls = Object.keys(urls).map(aUrl => [aUrl, urls[aUrl]]);
                    flattenedUrls.sort((a, b) => a[1] - b[1]);
                    flattenedUrls.reverse();
                    return flattenedUrls.map(entry => entry[0]);
                }
            };
        }());

        if (UICGLOBAL.manualMode !== true) {
            // We want to be able to trap location changes.  We catch
            // two ways that this can be done right now.  Clicking on
            // anchors and changing window.location.  We prevent the
            // anchor clicking case by installing a click handler on
            // all anchors that can prevent the click event.
            // We handle the {window|document}.location cases using
            // Object.watch
            sharedAnchorEventListiner = function (event) {
                var newUrl = event.currentTarget.href.trim();
                // If we have some anchor value that is often used for
                // indicating we shouldn't change pages, then we don't
                // need to intecept the call or anything similar
                if (!isUrlOnCurrentPage(newUrl)) {
                    UICGLOBAL.debug("Detected click on anchor with href: " + newUrl);
                    requestedUrls.add(newUrl);
                }
            };
            documentObserver = new MutationObserver(function (mutations) {
                mutations.forEach(function (aMutation) {
                    Array.prototype.forEach.call(aMutation.addedNodes, function (aNewNode) {
                        if (aNewNode.nodeName !== "a") {
                            return;
                        }
                        origAddEventListener.call(aNewNode, "click", sharedAnchorEventListiner, false);
                    });
                });
            });
            documentObserver.observe(window.document, {childList: true, subtree: true});


            onLocationChange = function (id, oldVal, newVal) {
                if (isUrlOnCurrentPage(newVal)) {
                    return newVal;
                }
                UICGLOBAL.debug("Detected location change to: " + newVal);
                requestedUrls.add(newVal);
                return newVal;
            };
            document.watch("location", function () {
                recordUsedFeature(["document", "location"]);
                onLocationChange.apply(this, arguments);
            });
            window.watch("location", function () {
                recordUsedFeature(["window", "location"]);
                onLocationChange.apply(this, arguments);
            });
            document.location.watch("href", function () {
                recordUsedFeature(["document", "location", "href"]);
                onLocationChange.apply(this, arguments);
            });
            window.location.watch("href", function () {
                recordUsedFeature(["window", "location", "href"]);
                onLocationChange.apply(this, arguments);
            });


            window.open = function (newUrl) {
                recordUsedFeature(["window", "open"]);
                if (isUrlOnCurrentPage(newUrl)) {
                    return allPurposeProxy;
                }
                UICGLOBAL.debug("Detected window.open call to: " + newUrl);
                requestedUrls.add(newUrl);
                return allPurposeProxy;
            };
        }


        // Override DOM features that interrupt program flow, since it can
        // keep firefox from exiting cleanly.
        window.alert = function () {
            recordUsedFeature(["window", "alert"]);
        };
        window.confirm = function () {
            recordUsedFeature(["window", "confirm"]);
            return true;
        };
        window.prompt = function (message, defaultMessage) {
            recordUsedFeature(["window", "prompt"]);
            return defaultMessage;
        };


        recordUsedFeature = function (featureName) {
            featureName = Array.isArray(featureName) ? featureName.join(".") : featureName;
            if (recordedFeatures[featureName] === undefined) {
                numFeaturesSeen += 1;
                recordedFeatures[featureName] = {
                    count: 1,
                    id: numFeaturesSeen
                };
            } else {
                recordedFeatures[featureName].count += 1;
            }

            // featureTimeline.push([recordedFeatures[featureName].id, eventLoopTurnIndex]);
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

            if (["document.location", "window.location", "window.open"].indexOf(propertyName) !== -1) {
                return;
            }

            // UICGLOBAL.debug(propertyName + ": Debugging property setting feature");

            if (propertyLookupResult === null) {
                UICGLOBAL.debug("Unable to find feature for property rule: " + propertyName);
                return false;
            }

            [propertyRef, propertyLeafName, propertyParentRef] = propertyLookupResult;
            propertyParentRef.watch(propertyLeafName, function (id, oldval, newval) {
                recordUsedFeature(propertyPath);
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
                // UICGLOBAL.debug("Unable to find feature for method rule: " + methodName);
                return false;
            }

            [featureRef, featureLeafName, parentRef] = methodLookupResult;
            parentRef[featureLeafName] = function () {
                recordUsedFeature(methodPath);
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

        if (UICGLOBAL.performance === "t") {
            performanceTimes.instrumentEndTime = Date.now();
            return;
        }

        if (UICGLOBAL.jsReport === true) {
            origAddEventListener.call(window, "beforeunload", function (event) {

                var scriptTags = origGetElementsByTagName.call(document, "script"),
                    data;

                data = Array.prototype.map.call(scriptTags, function (anElm) {

                    if (anElm.src) {
                        return {src: parseStringToUrl(anElm.src).href};
                    }
                    return {text: anElm.innerHTML};
                });

                UICGLOBAL.reportJavascript(data);
            });
        }

        if (UICGLOBAL.manualMode === true || ${isForIFrame}) {
            origAddEventListener.call(window, "beforeunload", function (event) {
                UICGLOBAL.reportUsedFeatures(recordedFeatures, featureTimeline);
            });
            return;
        }

        // If we're a top level document (ie not an iframe), then
        // we want to register to let the extension know when we're
        // fully loaded so that we can open some of them programatically.
        if (${isForIFrame}) {
            UICGLOBAL.debug("Instrumenting for iFrame: " + window.location.toString());
            return;
        }
        UICGLOBAL.debug("Instrumenting for top page: " + window.location.toString());

        origAddEventListener.call(document, "DOMContentLoaded", function (event) {

            origSetTimeout.call(window, function () {
                var anchorTags = origQuerySelectorAll.call(document, "a[href]"),
                    hrefs = Array.prototype.map.call(anchorTags, function (a) {
                        return a.href;
                    });
                UICGLOBAL.reportUsedFeatures(recordedFeatures, featureTimeline);
                UICGLOBAL.reportFoundUrls(requestedUrls.all(), hrefs);
            }, UICGLOBAL.secPerPage * 1000);

            gremlins.createHorde()
                .allGremlins()
                .unleash();
          }, false);
    }())`);
}());
