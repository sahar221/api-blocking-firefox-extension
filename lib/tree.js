"use strict";

var createTree;

createTree = function (aVal) {

    var children = [];

    return {
        addChild: function (childVal) {
            var newNode = createTree(childVal);
            children.push(newNode);
            return newNode;
        },
        depth: function (searchVal, currentDepth) {

            var searchResult;

            currentDepth = currentDepth || 0;

            if (aVal === searchVal) {
                return currentDepth;
            }

            searchResult = children.reduce(function (prev, cur) {
                return prev || cur.depth(searchVal, currentDepth + 1);
            }, undefined);

            return searchResult;
        },
        node: function (searchVal) {

            if (searchVal === aVal) {
                return this;
            }

            return children.reduce((prev, cur) => prev || cur.node(searchVal), undefined);
        },
        size: function () {

            var subTreeSize = children.reduce((prev, cur) => prev + cur.size(), 0);
            return children.length + subTreeSize;
        },
        toString: function (indentLevel) {

            var curString = "",
                index = 0;

            indentLevel = indentLevel || 0;
            
            for (index; index < indentLevel; index += 1) {
                curString += "\t";
            }
            curString += aVal;
            curString += "\n";
            curString += children.map(aNode => aNode.toString(indentLevel + 1)).join("");

            return curString;
        }
    };
};

exports.createTree = createTree;
