const _ = require('lodash');
const memoizeSync = require('memoizesync');
const esmangle = require('esmangle');
const esanimate = require('esanimate');
const escodegen = require('escodegen');
const estraverse = require('estraverse-fb');
const i18nTools = {};

function replaceDescendantNode(ancestorNode, oldNode, newNode) {
  estraverse.replace(ancestorNode, {
    enter: function (node) {
      if (node === oldNode) {
        this.break();
        return newNode;
      }
    },
    // Avoid crashing on node types supported by the parser, but not estraverse(-fb)
    // https://github.com/estools/estraverse/issues/97#issuecomment-438632003
    fallback: 'iteration',
  });
  return newNode;
}

// Replace - with _ and convert to lower case: en-GB => en_gb
i18nTools.normalizeLocaleId = function (localeId) {
  return localeId && localeId.replace(/-/g, '_').toLowerCase();
};

// Helper for getting a prioritized list of relevant locale ids from a specific locale id.
// For instance, "en_US" produces ["en_US", "en"]
i18nTools.expandLocaleIdToPrioritizedList = memoizeSync(function (localeId) {
  const localeIds = [localeId];
  while (/_[^_]+$/.test(localeId)) {
    localeId = localeId.replace(/_[^_]+$/, '');
    localeIds.push(localeId);
  }
  return localeIds;
});

i18nTools.tokenizePattern = require('./tokenizePattern');

i18nTools.patternToAst = function (pattern, placeHolderAsts) {
  let ast;
  i18nTools.tokenizePattern(pattern).forEach(function (token) {
    let term;
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

i18nTools.eachI18nTagInHtmlDocument = require('./eachI18nTagInHtmlDocument');

i18nTools.createI18nTagReplacer = require('./createI18nTagReplacer');

function foldConstant(node) {
  if (node.type === 'Literal') {
    return node;
  } else {
    const wrappedNode = {
      type: 'Program',
      body: [
        {
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: { type: 'Identifier', name: 'foo' },
              init: node,
            },
          ],
        },
      ],
    };
    const foldedNode = esmangle.optimize(wrappedNode);
    const valueNode = foldedNode.body[0].declarations[0].init;
    if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
      return valueNode;
    } else {
      return node;
    }
  }
}

function extractKeyAndDefaultValueFromCallNode(callNode) {
  const argumentAsts = callNode.arguments;

  if (argumentAsts.length === 0) {
    console.warn(
      'Invalid ' +
        escodegen.generate(callNode.callee) +
        ' syntax: ' +
        escodegen.generate(callNode)
    );
  } else {
    const keyNameAst = argumentAsts.length > 0 && foldConstant(argumentAsts[0]);

    const defaultValueAst =
      argumentAsts.length > 1 && foldConstant(argumentAsts[1]);

    const keyAndDefaultValue = {};
    if (
      keyNameAst &&
      keyNameAst.type === 'Literal' &&
      typeof keyNameAst.value === 'string'
    ) {
      keyAndDefaultValue.key = keyNameAst.value;
      if (defaultValueAst) {
        try {
          keyAndDefaultValue.defaultValue = esanimate.objectify(
            foldConstant(defaultValueAst)
          );
        } catch (e) {
          console.warn(
            'i18nTools.eachTrInAst: Invalid ' +
              escodegen.generate(callNode.callee) +
              ' default value syntax: ' +
              escodegen.generate(callNode)
          );
        }
      }
      return keyAndDefaultValue;
    } else {
      console.warn(
        'i18nTools.eachTrInAst: Invalid ' +
          escodegen.generate(callNode.callee) +
          ' key name syntax: ' +
          escodegen.generate(callNode)
      );
    }
  }
}

i18nTools.eachTrInAst = function (ast, lambda) {
  estraverse.traverse(ast, {
    enter: function (node, parentNode) {
      let keyAndDefaultValue;
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'CallExpression' &&
        node.callee.callee.type === 'MemberExpression' &&
        node.callee.callee.object.type === 'Identifier' &&
        node.callee.callee.object.name === 'TR' &&
        node.callee.callee.property.type === 'Identifier' &&
        node.callee.callee.property.name === 'PAT'
      ) {
        keyAndDefaultValue = extractKeyAndDefaultValueFromCallNode(node.callee);
        if (keyAndDefaultValue) {
          if (
            lambda(
              _.extend(keyAndDefaultValue, {
                type: 'callTR.PAT',
                node: node,
                parentNode: parentNode,
              })
            ) === false
          ) {
            return this.break();
          }
        }
      } else if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'TR'
      ) {
        keyAndDefaultValue = extractKeyAndDefaultValueFromCallNode(node);
        if (keyAndDefaultValue) {
          if (
            lambda(
              _.extend(keyAndDefaultValue, {
                type: 'TR',
                node: node,
                parentNode: parentNode,
              })
            ) === false
          ) {
            return this.break();
          }
        }
      } else if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'TR' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'PAT'
      ) {
        keyAndDefaultValue = extractKeyAndDefaultValueFromCallNode(node);
        if (keyAndDefaultValue) {
          if (
            lambda(
              _.extend(keyAndDefaultValue, {
                type: 'TR.PAT',
                node: node,
                parentNode: parentNode,
              })
            ) === false
          ) {
            return this.break();
          }
        }
      }
    },
    // Avoid crashing on node types supported by the parser, but not estraverse(-fb)
    // https://github.com/estools/estraverse/issues/97#issuecomment-438632003
    fallback: 'iteration',
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
  const allKeys = {};
  assetGraph
    .findAssets({ type: 'I18n', isLoaded: true })
    .forEach(function (i18nAsset) {
      Object.keys(i18nAsset.parseTree).forEach(function (key) {
        allKeys[key] = allKeys[key] || {};
        Object.keys(i18nAsset.parseTree[key]).forEach(function (localeId) {
          allKeys[key][i18nTools.normalizeLocaleId(localeId)] =
            i18nAsset.parseTree[key][localeId];
        });
      });
    });
  return allKeys;
};

// initialAsset must be Html or JavaScript
i18nTools.extractAllKeysForLocale = function (assetGraph, localeId) {
  localeId = i18nTools.normalizeLocaleId(localeId);
  const allKeys = i18nTools.extractAllKeys(assetGraph);
  const prioritizedLocaleIds = i18nTools.expandLocaleIdToPrioritizedList(
    localeId
  );
  const allKeysForLocale = {};
  Object.keys(allKeys).forEach(function (key) {
    for (let i = 0; i < prioritizedLocaleIds.length; i += 1) {
      if (prioritizedLocaleIds[i] in allKeys[key]) {
        allKeysForLocale[key] = allKeys[key][prioritizedLocaleIds[i]];
        break;
      }
    }
  });
  return allKeysForLocale;
};

i18nTools.createTrReplacer = function (options) {
  const allKeysForLocale = options.allKeysForLocale;

  return function trReplacer(options) {
    const node = options.node;
    const parentNode = options.parentNode;
    const type = options.type;
    const key = options.key;
    const value = allKeysForLocale[key];
    let valueAst;

    if (value === null || typeof value === 'undefined') {
      if (options.defaultValue) {
        valueAst = esanimate.astify(options.defaultValue);
      } else {
        valueAst = { type: 'Literal', value: '[!' + key + '!]' };
      }
    } else {
      valueAst = esanimate.astify(value);
    }
    if (type === 'callTR.PAT') {
      // Replace TR.PAT('keyName')(placeHolderValue, ...) with a string concatenation:
      if (valueAst.type !== 'Literal' || typeof valueAst.value !== 'string') {
        console.warn(
          'trReplacer: Invalid TR.PAT syntax: ' + escodegen.generate(node)
        );
        return;
      }
      replaceDescendantNode(
        parentNode,
        node,
        i18nTools.patternToAst(valueAst.value, node.arguments)
      );
    } else if (type === 'TR') {
      replaceDescendantNode(parentNode, node, valueAst);
    } else if (type === 'TR.PAT') {
      if (valueAst.type !== 'Literal' || typeof valueAst.value !== 'string') {
        console.warn('trReplacer: Invalid TR.PAT syntax: ' + value);
        return;
      }
      let highestPlaceHolderNumber;
      i18nTools.tokenizePattern(valueAst.value).forEach(function (token) {
        if (
          token.type === 'placeHolder' &&
          (!highestPlaceHolderNumber || token.value > highestPlaceHolderNumber)
        ) {
          highestPlaceHolderNumber = token.value;
        }
      });
      const argumentNameAsts = [];
      const placeHolderAsts = [];
      for (let j = 0; j <= highestPlaceHolderNumber; j += 1) {
        const argumentName = 'a' + j;
        placeHolderAsts.push({ type: 'Identifier', name: argumentName });
        argumentNameAsts.push({ type: 'Identifier', name: argumentName });
      }
      replaceDescendantNode(parentNode, node, {
        type: 'FunctionExpression',
        params: argumentNameAsts,
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: i18nTools.patternToAst(valueAst.value, placeHolderAsts),
            },
          ],
        },
      });
    }
  };
};

function isBootstrapperRelation(relation) {
  return (
    relation.type === 'HtmlScript' &&
    relation.node &&
    relation.node.getAttribute('id') === 'bootstrapper'
  );
}

// Get a object: key => array of "occurrence" objects that can either represent TR or TR.PAT expressions:
//   {asset: ..., type: 'TR'|'TR.PAT', node, ..., defaultValue: <ast>}
// or <span data-i18n="keyName">...</span> tags:
//   {asset: ..., type: 'i18nTag', node: ..., placeHolders: [...], defaultValue: <string>)
i18nTools.findOccurrences = function (assetGraph, initialAssets) {
  const trOccurrencesByKey = {};
  initialAssets.forEach(function (htmlAsset) {
    assetGraph
      .collectAssetsPostOrder(htmlAsset, {
        type: { $nin: ['HtmlAnchor', 'HtmlMetaRefresh', 'SvgAnchor'] },
      })
      .forEach(function (asset) {
        // Hack: Prevent system.js bundles from being written to disc:
        if (
          asset.isLoaded &&
          assetGraph.findRelations({ from: asset, to: { type: 'SourceMap' } })
            .length === 0
        ) {
          if (asset.type === 'JavaScript') {
            if (
              asset.incomingRelations.length === 0 ||
              !asset.incomingRelations.every(isBootstrapperRelation)
            ) {
              i18nTools.eachTrInAst(asset.parseTree, function (occurrence) {
                occurrence.asset = asset;
                (trOccurrencesByKey[occurrence.key] =
                  trOccurrencesByKey[occurrence.key] || []).push(occurrence);
              });
            }
          } else if (asset.type === 'Html') {
            i18nTools.eachI18nTagInHtmlDocument(
              asset.parseTree,
              function (occurrence) {
                if (occurrence.key) {
                  occurrence.asset = asset;
                  (trOccurrencesByKey[occurrence.key] =
                    trOccurrencesByKey[occurrence.key] || []).push(occurrence);
                }
              }
            );
          }
        }
      });
  });
  return trOccurrencesByKey;
};

_.extend(exports, i18nTools);
