"use strict";

var urlLib = require("sdk/url"),
    prioritizeUrls;


/**
 * Tries to reduce a large number of URLs to a smaller set, sorted from
 * most to least likely to have dissimilar content.
 *
 * @param array urls
 *   Zero or more strings, depicting website URLs
 * @param array allowedHosts
 *   An array of strings, which will be used to limit the returned URLs
 *   to those on the same hosts
 *
 * @return array
 *   An array of zero or more strings, each representing a URL
 */
prioritizeUrls = function (urls, allowedHosts) {

    var urlMap = {},
        urlsPerHost;

    // First, reduce the list by removing duplicates.
    urls.forEach(aUrl => urlMap[aUrl] = true);
    urls = Object.keys(urlMap);

    // Next only have one URL per host that has the same initial path
    // portion.  We use the path as a rough heurisitc to avoid opening
    // many very similar pages.
    urlMap = {};
    urls.forEach(function (aUrl) {

        var urlParts, urlHost, urlPath, pathParts, firstPathSection;

        try {
            urlParts = new urlLib.URL(aUrl);
        } catch (e) {
            // If we're giving an invalid URL, we don't want to explode
            // and ruin the entire measure.
            return;
        }

        urlHost = urlParts.host || "";
        urlPath = urlParts.path || "";
        pathParts = urlPath.split("/").filter(aPart => !!aPart);
        firstPathSection = pathParts.length === 0 ? "" : pathParts[0];

        if (urlMap[urlHost] === undefined) {
            urlMap[urlHost] = {};
        }

        urlMap[urlHost][firstPathSection] = aUrl;
    });

    urlsPerHost = Object.keys(urlMap).map(function (aHost) {

        if (allowedHosts.indexOf(aHost) === -1) {
            return [];
        }

        return Object.keys(urlMap[aHost]).map(function (aPathSec) {
            return urlMap[aHost][aPathSec];
        });
    });

    // Finally, flatten the array from an array of arrays to a single array
    return urlsPerHost.reduce((prev, cur) => prev.concat(cur), []);
};


exports.prioritizeUrls = prioritizeUrls;
