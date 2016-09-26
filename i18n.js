// System.js plugin
function normalizeLocaleId(localeId) {
    return localeId && localeId.replace(/-/g, '_').toLowerCase();
}

// Helper for getting a prioritized, normalized list of relevant locale ids from a specific locale id.
// For instance, 'en_US' produces ['en_us', 'en']
function expandLocaleIdToPrioritizedList(localeId) {
    if (!localeId) {
        return [];
    }
    localeId = normalizeLocaleId(localeId);
    var localeIds = [ localeId ];
    while (/_[^_]+$/.test(localeId)) {
        localeId = localeId.replace(/_[^_]+$/, '');
        localeIds.push(localeId);
    }
    return localeIds;
}

function createTr(localeData) {
    function tokenizePattern(pattern) {
        if (typeof pattern !== 'string') {
            var valueString = pattern;
            try {
                valueString = JSON.stringify(pattern);
            } catch (e) {}
            throw new Error('i18nTools.tokenizePattern: Value must be a string: ' + valueString);
        }
        var tokens = [],
            fragments = pattern.split(/(\{\d+\})/);
        for (var i = 0 ; i < fragments.length ; i += 1) {
            var fragment = fragments[i];
            if (fragment.length > 0) {
                var matchPlaceHolder = fragment.match(/^\{(\d+)\}$/);
                if (matchPlaceHolder) {
                    tokens.push({
                        type: 'placeHolder',
                        value: parseInt(matchPlaceHolder[1], 10)
                    });
                } else {
                    tokens.push({
                        type: 'text',
                        value: fragment
                    });
                }
            }
        }
        return tokens;
    }

    function eachI18nTagInHtmlDocument(document, lambda, nestedTemplateLambda) {
        var ELEMENT_NODE = 1,
            TEXT_NODE = 3,
            queue = [document],
            i;
        while (queue.length) {
            var node = queue.shift(),
                parentNode = node.parentNode,
                nodeStillInDocument = true;
            if (parentNode && node.nodeType === ELEMENT_NODE) {
                if (node.hasAttribute && node.hasAttribute('data-i18n')) { // In IE7 the HTML node doesn't have a hasAttribute method?
                    var i18nStr = node.getAttribute('data-i18n'),
                        i18nObj;

                    if (i18nStr.indexOf(':') !== -1) {
                        try {
                            i18nObj = eval('({' + i18nStr + '})'); // eslint-disable-line no-eval
                        } catch (e) {
                            throw new Error('eachI18nTagInHtmlDocument: Error evaluating data-i18n attribute: ' + i18nStr + '\n' + e.stack);
                        }
                    } else {
                        i18nObj = {text: i18nStr};
                    }

                    if (i18nObj.attr) {
                        var attributeNames = Object.keys(i18nObj.attr);
                        for (i = 0 ; i < attributeNames.length ; i += 1) {
                            var attributeName = attributeNames[i],
                                key = i18nObj.attr[attributeName] || null;
                            if (lambda({type: 'i18nTagAttribute', attributeName: attributeName, node: node, key: key, defaultValue: node.getAttribute(attributeName)}) === false) {
                                return;
                            }
                        }
                    }

                    if (typeof i18nObj.text !== 'undefined') {
                        var defaultValue = '',
                            placeHolders = [],
                            nextPlaceHolderNumber = 0;

                        for (i = 0 ; i < node.childNodes.length ; i += 1) {
                            var childNode = node.childNodes[i];
                            if (childNode.nodeType === TEXT_NODE) {
                                defaultValue += childNode.nodeValue;
                            } else {
                                defaultValue += '{' + nextPlaceHolderNumber + '}';
                                nextPlaceHolderNumber += 1;
                                placeHolders.push(childNode);
                            }
                        }
                        defaultValue = defaultValue.replace(/^[ \n\t]+|[ \n\t]+$/g, ''); // Trim leading and trailing whitespace, except non-breaking space chars
                        defaultValue = defaultValue.replace(/[ \n\t]+/g, ' '); // Compress and normalize sequences of 1+ spaces to one ' '
                        if (lambda({type: 'i18nTagText', node: node, key: i18nObj.text || null, defaultValue: defaultValue, placeHolders: placeHolders}) === false) {
                            return;
                        }
                    } else {
                        // A tag with a data-i18n tag, but no language key for the text contents.
                        // Give the lambda a chance to clean up the tag anyway:
                        lambda({node: node});
                    }
                    if (!node.parentNode) {
                        nodeStillInDocument = false;
                        queue.unshift(parentNode);
                    }
                }
                // Give the caller a chance to do something about nested <script type="text/html">...</script> templates (used by TRHTML in the browser):
                if (nestedTemplateLambda && node.nodeName.toLowerCase() === 'script' && node.getAttribute('type') === 'text/html') {
                    nestedTemplateLambda(node);
                }
            }
            if (nodeStillInDocument && node.childNodes) {
                for (i = node.childNodes.length - 1 ; i >= 0 ; i -= 1) {
                    queue.unshift(node.childNodes[i]);
                }
            }
        }
    }

    function createI18nTagReplacer(options) {
        var TEXT_NODE = 3,
            allKeysForLocale = options.allKeysForLocale,
            keepI18nAttributes = options.keepI18nAttributes,
            keepSpans = options.keepSpans;

        return function i18nTagReplacer(options) {
            var key = options.key,
                node = options.node,
                value = allKeysForLocale[key],
                removeNode = !keepSpans && options.type !== 'i18nTagAttribute' && node.nodeName.toLowerCase() === 'span' && node.attributes.length === 1;

            if (key !== null) { // An empty string or null means explicitly "do not translate"
                if (/^i18nTag/.test(options.type) && value === null || typeof value === 'undefined') {
                    value = options.defaultValue || '[!' + key + '!]';
                }
                if (options.type === 'i18nTagAttribute') {
                    node.setAttribute(options.attributeName, value);
                } else if (options.type === 'i18nTagText') {
                    while (node.childNodes.length) {
                        node.removeChild(node.firstChild);
                    }
                    tokenizePattern(value).forEach(function (token) {
                        var nodeToInsert;
                        if (token.type === 'text') {
                            nodeToInsert = node.ownerDocument.createTextNode(token.value);
                        } else {
                            var placeHolder = options.placeHolders[token.value];
                            if (placeHolder) {
                                nodeToInsert = placeHolder;
                                if (nodeToInsert.parentNode) {
                                    nodeToInsert = nodeToInsert.cloneNode(true);
                                }
                            } else {
                                nodeToInsert = node.ownerDocument.createTextNode('[!{' + token.value + '}!]');
                            }
                        }
                        if (removeNode) {
                            if (nodeToInsert.nodeType === TEXT_NODE && node.previousSibling && node.previousSibling.nodeType === TEXT_NODE) {
                                // Splice with previous text node
                                node.previousSibling.nodeValue += nodeToInsert.nodeValue;
                            } else {
                                node.parentNode.insertBefore(nodeToInsert, node);
                            }
                        } else {
                            node.appendChild(nodeToInsert);
                        }
                    });
                }
            }
            if (removeNode) {
                node.parentNode.removeChild(node);
            } else if (!keepI18nAttributes && options.type !== 'i18nTagAttribute') {
                node.removeAttribute('data-i18n');
            }
        };
    }

    var TR = function (key, defaultValue) {
        return localeData[key] || defaultValue || '[!' + key + '!]';
    };

    TR.PAT = function (key, defaultPattern) {
        var pattern = TR(key, defaultPattern), tokens = tokenizePattern(pattern);
        return function () {
            // placeHolderValue, ...
            var placeHolderValues = arguments, renderedString = '';
            for (var i = 0; i < tokens.length; i += 1) {
                var token = tokens[i];
                if (token.type === 'placeHolder') {
                    renderedString += placeHolderValues[token.value];
                } else {
                    // token.type === 'text'
                    renderedString += token.value;
                }
            }
            return renderedString;
        };
    };

    TR.HTML = function (htmlString) {
        var div = document.createElement('div');
        div.innerHTML = htmlString;
        require('./lib/eachI18nTagInHtmlDocument')(div, require('./lib/createI18nTagReplacer')({
            allKeysForLocale: localeData,
            keepI18nAttributes: true,
            keepSpans: true
        }), function nestedTemplateHandler(node) {
            if (node.firstChild && node.firstChild.nodeType === node.TEXT_NODE) {
                // Use window.TRHTML instead of TRHTML to prevent the recursive call from being recognized as a relation:
                node.firstChild.nodeValue = window.TR.HTML(node.firstChild.nodeValue);
            }
        });
        return div.innerHTML;
    };

    return TR;
}

function gatherKeysForLocale(source, locale) {
    var prioritizedLocale = expandLocaleIdToPrioritizedList(locale);
    return Object.keys(source).reduce(function (data, key) {
        for (var i = 0 ; i < prioritizedLocale.length ; i += 1) {
            var value = source[key][prioritizedLocale[i]];
            if (typeof value !== 'undefined') {
                data[key] = value;
                break;
            }
        }
        return data;
    }, {});
}

module.exports = {
    // fetch: sideeffect: load relevant parts of i18n file filtered by locale
    fetch: function (load, fetch) {
        load.metadata.newAddress = load.address.replace(/\.([^.]+)\.i18n/, function (str, matchedLocale) {
            load.metadata.locale = matchedLocale;
            return '.i18n';
        });
        return fetch({address: load.metadata.newAddress, metadata: {}});
    },

    translate: function (load) {
        if (this.builder) {
            load.metadata.format = 'cjs';
            load.metadata.originalSource = load.source;
            return 'module.exports = (' + createTr.toString() + ')(' + JSON.stringify(gatherKeysForLocale(JSON.parse(load.source), load.metadata.locale)) + ');';
        }
    },

    instantiate: function (load) {
        if (!this.builder) {
            return createTr(gatherKeysForLocale(JSON.parse(load.source), load.metadata.locale));
        }
    },

    listAssets: function (loads) {
        var isSeenByNewAddress = {};
        var i18nAssets = [];
        loads.forEach(function (load) {
            if (!isSeenByNewAddress[load.metadata.newAddress]) {
                isSeenByNewAddress[load.metadata.newAddress] = true;
                i18nAssets.push({
                    url: load.metadata.newAddress,
                    source: load.metadata.originalSource,
                    type: 'i18n'
                });
            }
        });
        return i18nAssets;
    }
};
