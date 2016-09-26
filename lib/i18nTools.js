var _ = require('lodash'),
    memoizeSync = require('memoizesync'),
    esmangle = require('esmangle'),
    esanimate = require('esanimate'),
    escodegen = require('escodegen'),
    estraverse = require('estraverse'),
    replaceDescendantNode = require('assetgraph/lib/replaceDescendantNode'),
    i18nTools = {};

// These have been moved to the system.js plugin:
i18nTools.tokenizePattern = require('../i18n').tokenizePattern;
i18nTools.eachI18nTagInHtmlDocument = require('../i18n').eachI18nTagInHtmlDocument;
i18nTools.createI18nTagReplacer = require('../i18n').createI18nTagReplacer;

 // Replace - with _ and convert to lower case: en-GB => en_gb
i18nTools.normalizeLocaleId = function (localeId) {
    return localeId && localeId.replace(/-/g, '_').toLowerCase();
};

// Helper for getting a prioritized list of relevant locale ids from a specific locale id.
// For instance, "en_US" produces ["en_US", "en"]
i18nTools.expandLocaleIdToPrioritizedList = memoizeSync(function (localeId) {
    var localeIds = [localeId];
    while (/_[^_]+$/.test(localeId)) {
        localeId = localeId.replace(/_[^_]+$/, '');
        localeIds.push(localeId);
    }
    return localeIds;
});

i18nTools.patternToAst = function (pattern, placeHolderAsts) {
    var ast;
    i18nTools.tokenizePattern(pattern).forEach(function (token) {
        var term;
        if (token.type === 'placeHolder') {
            term = placeHolderAsts[token.value];
        } else {
            term = { type: 'Literal', value: token.value };
        }
        if (ast) {
            ast = { type: 'BinaryExpression', operator: '+', left: ast, right: term };
        } else {
            ast = term;
        }
    });
    return ast || { type: 'Literal', value: '' };
};

function foldConstant(node) {
    if (node.type === 'Literal') {
        return node;
    } else {
        var wrappedNode = {
            type: 'Program',
            body: [
                {
                    type: 'VariableDeclaration',
                    kind: 'var',
                    declarations: [
                        {
                            type: 'VariableDeclarator',
                            id: { type: 'Identifier', name: 'foo' },
                            init: node
                        }
                    ]
                }
            ]
        };
        var foldedNode = esmangle.optimize(wrappedNode);
        var valueNode = foldedNode.body[0].declarations[0].init;
        if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
            return valueNode;
        } else {
            return node;
        }
    }
}

function extractKeyAndDefaultValueFromCallNode(callNode) {
    var argumentAsts = callNode.arguments;

    if (argumentAsts.length === 0) {
        console.warn('Invalid ' + escodegen.generate(callNode.callee) + ' syntax: ' + escodegen.generate(callNode));
    } else {
        var keyNameAst = argumentAsts.length > 0 && foldConstant(argumentAsts[0]),
            defaultValueAst = argumentAsts.length > 1 && foldConstant(argumentAsts[1]),
            keyAndDefaultValue = {};
        if (keyNameAst && keyNameAst.type === 'Literal' && typeof keyNameAst.value === 'string') {
            keyAndDefaultValue.key = keyNameAst.value;
            if (defaultValueAst) {
                try {
                    keyAndDefaultValue.defaultValue = esanimate.objectify(foldConstant(defaultValueAst));
                } catch (e) {
                    console.warn('i18nTools.eachTrInAst: Invalid ' + escodegen.generate(callNode.callee) + ' default value syntax: ' + escodegen.generate(callNode));
                }
            }
            return keyAndDefaultValue;
        } else {
            console.warn('i18nTools.eachTrInAst: Invalid ' + escodegen.generate(callNode.callee) + ' key name syntax: ' + escodegen.generate(callNode));
        }
    }
}

i18nTools.eachTrInAst = function (ast, lambda) {
    estraverse.traverse(ast, {
        enter: function (node, parentNode) {
            var keyAndDefaultValue;
            if (node.type === 'CallExpression' &&
            node.callee.type === 'CallExpression' &&
            node.callee.callee.type === 'Identifier' &&
            node.callee.callee.name === 'TRPAT') {

                keyAndDefaultValue = extractKeyAndDefaultValueFromCallNode(node.callee);
                if (keyAndDefaultValue) {
                    if (lambda(_.extend(keyAndDefaultValue, {type: 'callTRPAT', node: node, parentNode: parentNode})) === false) {
                        return this.break();
                    }
                }
            } else if (node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            (node.callee.name === 'TR' || node.callee.name === 'TRPAT')) {
                keyAndDefaultValue = extractKeyAndDefaultValueFromCallNode(node);
                if (keyAndDefaultValue) {
                    if (lambda(_.extend(keyAndDefaultValue, {type: node.callee.name, node: node, parentNode: parentNode})) === false) {
                        return this.break();
                    }
                }
            }
        }
    });
};

i18nTools.eachOccurrenceInAsset = function (asset, lambda) {
    if (asset.type === 'JavaScript') {
        i18nTools.eachTrInAst(asset.parseTree, lambda);
    } else if (asset.isHtml || asset.type === 'Svg') {
        i18nTools.eachI18nTagInHtmlDocument(asset.parseTree, lambda);
    }
};

i18nTools.extractAllKeys = function (assetGraph) {
    var allKeys = {};
    assetGraph.findAssets({type: 'I18n', isLoaded: true}).forEach(function (i18nAsset) {
        Object.keys(i18nAsset.parseTree).forEach(function (key) {
            allKeys[key] = allKeys[key] || {};
            Object.keys(i18nAsset.parseTree[key]).forEach(function (localeId) {
                allKeys[key][i18nTools.normalizeLocaleId(localeId)] = i18nAsset.parseTree[key][localeId];
            });
        });
    });
    return allKeys;
};

// initialAsset must be Html or JavaScript
i18nTools.extractAllKeysForLocale = function (assetGraph, localeId) {
    localeId = i18nTools.normalizeLocaleId(localeId);
    var allKeys = i18nTools.extractAllKeys(assetGraph),
        prioritizedLocaleIds = i18nTools.expandLocaleIdToPrioritizedList(localeId),
        allKeysForLocale = {};
    Object.keys(allKeys).forEach(function (key) {
        for (var i = 0 ; i < prioritizedLocaleIds.length ; i += 1) {
            if (prioritizedLocaleIds[i] in allKeys[key]) {
                allKeysForLocale[key] = allKeys[key][prioritizedLocaleIds[i]];
                break;
            }
        }
    });
    return allKeysForLocale;
};

i18nTools.createTrReplacer = function (options) {
    var allKeysForLocale = options.allKeysForLocale;

    return function trReplacer(options) {
        var node = options.node,
            parentNode = options.parentNode,
            type = options.type,
            key = options.key,
            value = allKeysForLocale[key],
            valueAst;

        if (value === null || typeof value === 'undefined') {
            if (options.defaultValue) {
                valueAst = esanimate.astify(options.defaultValue);
            } else {
                valueAst = { type: 'Literal', value: '[!' + key + '!]' };
            }
        } else {
            valueAst = esanimate.astify(value);
        }
        if (type === 'callTRPAT') {
            // Replace TRPAT('keyName')(placeHolderValue, ...) with a string concatenation:
            if (valueAst.type !== 'Literal' || typeof valueAst.value !== 'string') {
                console.warn('trReplacer: Invalid TRPAT syntax: ' + escodegen.generate(node));
                return;
            }
            replaceDescendantNode(parentNode, node, i18nTools.patternToAst(valueAst.value, node.arguments));
        } else if (type === 'TR') {
            replaceDescendantNode(parentNode, node, valueAst);
        } else if (type === 'TRPAT') {
            if (valueAst.type !== 'Literal' || typeof valueAst.value !== 'string') {
                console.warn('trReplacer: Invalid TRPAT syntax: ' + value);
                return;
            }
            var highestPlaceHolderNumber;
            i18nTools.tokenizePattern(valueAst.value).forEach(function (token) {
                if (token.type === 'placeHolder' && (!highestPlaceHolderNumber || token.value > highestPlaceHolderNumber)) {
                    highestPlaceHolderNumber = token.value;
                }
            });
            var argumentNameAsts = [],
                placeHolderAsts = [];
            for (var j = 0 ; j <= highestPlaceHolderNumber ; j += 1) {
                var argumentName = 'a' + j;
                placeHolderAsts.push({ type: 'Identifier', name: argumentName });
                argumentNameAsts.push({ type: 'Identifier', name: argumentName });
            }
            replaceDescendantNode(parentNode, node, {
                type: 'FunctionExpression',
                params: argumentNameAsts,
                body: {
                    type: 'BlockStatement',
                    body: [
                        { type: 'ReturnStatement', argument: i18nTools.patternToAst(valueAst.value, placeHolderAsts)}
                    ]
                }
            });
        }
    };
};

function isBootstrapperRelation(relation) {
    return relation.type === 'HtmlScript' && relation.node && relation.node.getAttribute('id') === 'bootstrapper';
}

// Get a object: key => array of "occurrence" objects that can either represent TR or TRPAT expressions:
//   {asset: ..., type: 'TR'|'TRPAT', node, ..., defaultValue: <ast>}
// or <span data-i18n="keyName">...</span> tags:
//   {asset: ..., type: 'i18nTag', node: ..., placeHolders: [...], defaultValue: <string>)
i18nTools.findOccurrences = function (assetGraph, initialAssets) {
    var trOccurrencesByKey = {};
    initialAssets.forEach(function (htmlAsset) {
        assetGraph.collectAssetsPostOrder(htmlAsset, {type: assetGraph.query.not(['HtmlAnchor', 'HtmlMetaRefresh', 'SvgAnchor'])}).forEach(function (asset) {
            // Hack: Prevent system.js bundles from being written to disc:
            if (asset.isLoaded && assetGraph.findRelations({ from: asset, to: { type: 'SourceMap' } }).length === 0) {
                if (asset.type === 'JavaScript') {
                    if (asset.incomingRelations.length === 0 || !asset.incomingRelations.every(isBootstrapperRelation)) {
                        i18nTools.eachTrInAst(asset.parseTree, function (occurrence) {
                            occurrence.asset = asset;
                            (trOccurrencesByKey[occurrence.key] = trOccurrencesByKey[occurrence.key] || []).push(occurrence);
                        });
                    }
                } else if (asset.type === 'Html') {
                    i18nTools.eachI18nTagInHtmlDocument(asset.parseTree, function (occurrence) {
                        if (occurrence.key) {
                            occurrence.asset = asset;
                            (trOccurrencesByKey[occurrence.key] = trOccurrencesByKey[occurrence.key] || []).push(occurrence);
                        }
                    });
                }
            }
        });
    });
    return trOccurrencesByKey;
};

_.extend(exports, i18nTools);
