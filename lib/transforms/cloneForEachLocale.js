const _ = require('lodash'), estraverse = require('estraverse'), esanimate = require('esanimate'), i18nTools = require('../i18nTools'), htmlLangCssSelectorRegExp = /(?:^|,\s*)(html\[\s*lang\s*(?:=|\|=|~=)\s*(|'|").*?\1\s*\])(.*)$/i;

function singleQuoteString(str) {
  return "'" + str.replace(/'/g, "\\'") + "'";
}

function isLeftHandSideOfAssignment(stack, topNode) {
  function getItem(i) {
    if (i === stack.length) {
      return topNode;
    } else {
      return stack[i];
    }
  }
  for (let i = stack.length; i >= 0; i -= 1) {
    const node = getItem(i);
    if (node.type === 'AssignmentExpression') {
      if (getItem(i + 1) === node.left) {
        return true;
      } else {
        break;
      }
    } else if (node.type === 'VariableDeclarator') {
      if (getItem(i + 1) === node.id.name) {
        return true;
      } else {
        break;
      }
    }
  }
  return false;
}

function getParsedDataSystemJsConditionalsFromRelation(relation) {
  if (relation.type === 'HtmlScript' || relation.type === 'HtmlStyle') {
    const dataCond = relation.node.getAttribute('data-assetgraph-conditions');
    if (dataCond) {
      // FIXME: Use object-literal-parse?
      try {
        return eval('({' + dataCond + '})'); // eslint-disable-line no-eval
      } catch (e) {}
    }
  }
}

function assetNeedsLocalization(asset, assetGraph) {
  const incomingRelations = asset.incomingRelations;
  if (
    incomingRelations.some(function(incomingRelation) {
      const parsedDataCond = getParsedDataSystemJsConditionalsFromRelation(
        incomingRelation
      );
      return (
        parsedDataCond &&
        (parsedDataCond['locale.js|default'] ||
          parsedDataCond['locale|default'])
      );
    })
  ) {
    return true;
  }
  let needsLocalization = false;
  if (asset.type === 'JavaScript') {
    if (
      incomingRelations.every(function(incomingRelation) {
        return (
          incomingRelation.type !== 'HtmlScript' ||
          incomingRelation.node.id !== 'bootstrapper'
        );
      })
    ) {
      estraverse.traverse(asset.parseTree, {
        enter: function(node) {
          // TODO: The presence of only LOCALECOOKIENAME/SUPPORTEDLOCALEIDS/DEFAULTLOCALEID don't really require the asset to be cloned as
          // they just need to be replaced to the same value in each locale.
          if (
            (node.type === 'Identifier' &&
              /^(?:LOCALEID|SUPPORTEDLOCALEIDS|DEFAULTLOCALEID|LOCALECOOKIENAME)$/.test(
                node.name
              ) &&
              !isLeftHandSideOfAssignment(this.parents(), node)) ||
            (node.type === 'CallExpression' &&
              node.callee.type === 'Identifier' &&
              /^TR(?:PAT)?$/.test(node.callee.name))
          ) {
            needsLocalization = true;
            return this.break();
          }
        }
      });
    }
  } else if (asset.isHtml || asset.isSvg) {
    i18nTools.eachI18nTagInHtmlDocument(asset.parseTree, function(options) {
      if (options.key !== null) {
        needsLocalization = true;
        return false;
      }
    });
  } else if (asset.type === 'Css') {
    asset.eachRuleInParseTree(function(cssRule, parentRuleOrStylesheet) {
      if (cssRule.type === 'rule') {
        if (htmlLangCssSelectorRegExp.test(cssRule.selector)) {
          needsLocalization = true;
          return false;
        }
      }
    });
  }
  return needsLocalization;
}

function isBootstrapperRelation(relation) {
  return (
    relation.type === 'HtmlScript' &&
    relation.node &&
    relation.node.getAttribute('id') === 'bootstrapper'
  );
}

function followRelationFn(relation) {
  return (
    relation.type !== 'HtmlAnchor' &&
    relation.type !== 'HtmlMetaRefresh' &&
    relation.type !== 'SvgAnchor' &&
    relation.type !== 'JavaScriptSourceUrl' &&
    !isBootstrapperRelation(relation)
  );
}

module.exports = function(queryObj, options) {
  const localeIds = options.localeIds.map(i18nTools.normalizeLocaleId),
        defaultLocaleId = i18nTools.normalizeLocaleId(
          options.defaultLocaleId || 'en'
        ),
        keepSpans = options.keepSpans;

  return function cloneForEachLocale(assetGraph) {
    const potentiallyOrphanedAssetsById = {};
    const isOriginalHtmlAssetById = {};
    assetGraph
      .findAssets(_.extend({ type: 'Html' }, queryObj))
      .forEach(function(originalHtmlAsset) {
        isOriginalHtmlAssetById[originalHtmlAsset.id] = true;
        const assetToLocalizeById = {}, assetsToLocalize = [];
        assetGraph.eachAssetPostOrder(
          originalHtmlAsset,
          followRelationFn,
          function(asset) {
            if (
              asset.isLoaded &&
              (assetNeedsLocalization(asset) ||
                assetGraph
                  .findRelations({ from: asset })
                  .some(function(outgoingRelation) {
                    return outgoingRelation.to.id in assetToLocalizeById;
                  }))
            ) {
              assetToLocalizeById[asset.id] = asset;
              assetsToLocalize.push(asset);
            }
          }
        );

        const nonInlineAssetsToLocalizePreOrder = [];
        assetGraph.eachAssetPreOrder(
          originalHtmlAsset,
          followRelationFn,
          function(asset) {
            if (!asset.isInline && asset.id in assetToLocalizeById) {
              potentiallyOrphanedAssetsById[asset.id] = asset;
              nonInlineAssetsToLocalizePreOrder.push(asset);
            }
          }
        );

        localeIds.forEach(function(localeId) {
          const allKeysForLocale = i18nTools.extractAllKeysForLocale(
                    assetGraph,
                    localeId
                  ),
                trReplacer = i18nTools.createTrReplacer({
                  allKeysForLocale: allKeysForLocale,
                  localeId: localeId,
                  defaultLocaleId: defaultLocaleId
                }),
                i18nTagReplacer = i18nTools.createI18nTagReplacer({
                  allKeysForLocale: allKeysForLocale,
                  localeId: localeId,
                  defaultLocaleId: defaultLocaleId,
                  keepSpans: keepSpans
                }),
                globalValueByName = {
                  LOCALEID: localeId,
                  SUPPORTEDLOCALEIDS: localeIds,
                  DEFAULTLOCALEID: defaultLocaleId
                };

          ['localeCookieName'].forEach(function(optionName) {
            if (options[optionName]) {
              globalValueByName[optionName.toUpperCase()] = options[optionName];
            }
          });

          const localizedAssets = [];

          function localizeAsset(asset) {
            if (asset.type === 'JavaScript') {
              if (asset.incomingRelations.every(isBootstrapperRelation)) {
                return;
              }
              i18nTools.eachTrInAst(asset.parseTree, trReplacer);

              estraverse.replace(asset.parseTree, {
                enter: function(node) {
                  if (
                    node.type === 'Identifier' &&
                    globalValueByName.hasOwnProperty(node.name) &&
                    !isLeftHandSideOfAssignment(this.parents(), node)
                  ) {
                    return esanimate.astify(globalValueByName[node.name]);
                  }
                }
              });
              asset.markDirty();
            } else if (asset.isHtml || asset.isSvg) {
              const document = asset.parseTree;
              i18nTools.eachI18nTagInHtmlDocument(document, i18nTagReplacer);
              if (document.documentElement) {
                document.documentElement.setAttribute('lang', localeId);
              }
              asset.markDirty();
            } else if (asset.type === 'Css') {
              const cssRules = [];
              asset.eachRuleInParseTree(function(cssRule) {
                if (cssRule.type === 'rule') {
                  cssRules.push(cssRule);
                }
              });
              // Traverse the rules in reverse so the indices aren't screwed up by deleting rules underway:
              cssRules.reverse().forEach(function(node) {
                const matchSelectorText = node.selector.match(
                  htmlLangCssSelectorRegExp
                );
                if (matchSelectorText) {
                  const rewrittenSelectorFragments = [];

                  node.selector
                    .split(/\s*,\s*/)
                    .forEach(function(selectorFragment) {
                      const matchSelectorFragment = selectorFragment.match(
                        /(html\[\s*lang\s*(?:=|\|=|~=)\s*(|'|").*?\1\s*\])(.*)$/i
                      );
                      if (matchSelectorFragment) {
                        if (
                          localizedAssets[0].parseTree.querySelectorAll(
                            matchSelectorFragment[1]
                          ).length > 0
                        ) {
                          rewrittenSelectorFragments.push(
                            'html' + matchSelectorFragment[3]
                          );
                        }
                      } else {
                        rewrittenSelectorFragments.push(selectorFragment);
                      }
                    });
                  if (rewrittenSelectorFragments.length > 0) {
                    node.selector = rewrittenSelectorFragments.join(', ');
                  } else {
                    assetGraph
                      .findRelations({ from: asset })
                      .forEach(function(outgoingRelation) {
                        if (outgoingRelation.node !== node) {
                          return;
                        }
                        if (outgoingRelation.to.isInline) {
                          assetGraph.removeAsset(outgoingRelation.to);
                        }
                        asset.removeRelation(outgoingRelation);
                      });
                    node.parent.removeChild(node);
                  }
                }
              });
              asset.markDirty();
            }
          }

          // asset.clone adds the asset to the graph and populates the relations. Since the localization
          // could introduce or remove relations, it needs to happen before the population.
          // The 'addAsset' event is emitted right before the population takes place, so that does the job.
          // (Would of course be cleaner if asset.clone was split up or supported a hook at this point).
          assetGraph.on('addAsset', localizeAsset);

          nonInlineAssetsToLocalizePreOrder.forEach(function(asset) {
            const incomingRelationsFromLocalizedAssets = assetGraph.findRelations(
              {
                to: asset,
                from: { nonInlineAncestor: { $in: localizedAssets } }
              }
            );
            const targetUrl = asset.url.replace(
              /(\.\w+)?$/,
              '.' + localeId + '$1'
            );
            const existingLocalizedAsset = assetGraph.findAssets({
              url: targetUrl
            })[0];
            const incomingHtmlScriptsAndHtmlStyles = incomingRelationsFromLocalizedAssets.filter(
              function(relation) {
                return (
                  relation.type === 'HtmlScript' ||
                  relation.type === 'HtmlStyle'
                );
              }
            );
            const dataSystemJsConditionals =
              incomingHtmlScriptsAndHtmlStyles.length === 1 &&
              getParsedDataSystemJsConditionalsFromRelation(
                incomingHtmlScriptsAndHtmlStyles[0]
              );
            if (dataSystemJsConditionals) {
              let localeKey = 'locale.js|default';
              let localeValue = dataSystemJsConditionals[localeKey];
              if (!localeValue) {
                localeKey = 'locale|default';
                localeValue = dataSystemJsConditionals[localeKey];
              }
              if (localeValue) {
                if (localeValue === localeId) {
                  delete dataSystemJsConditionals[localeKey];
                  const remainingKeys = Object.keys(dataSystemJsConditionals);
                  if (remainingKeys.length === 0) {
                    incomingHtmlScriptsAndHtmlStyles[0].node.removeAttribute(
                      'data-assetgraph-conditions'
                    );
                  } else {
                    incomingHtmlScriptsAndHtmlStyles[0].node.setAttribute(
                      'data-assetgraph-conditions',
                      remainingKeys
                        .map(function(key) {
                          return (
                            (/[^a-z]/.test(key)
                              ? singleQuoteString(key)
                              : key) +
                            ': ' +
                            singleQuoteString(dataSystemJsConditionals[key])
                          );
                        })
                        .join(', ')
                    );
                  }
                  incomingHtmlScriptsAndHtmlStyles[0].from.markDirty();
                } else {
                  incomingHtmlScriptsAndHtmlStyles[0].detach();
                }
                return;
              }
            }
            if (existingLocalizedAsset) {
              incomingRelationsFromLocalizedAssets.forEach(function(
                incomingRelation
              ) {
                incomingRelation.to = existingLocalizedAsset;
                incomingRelation.refreshHref();
              });
            } else {
              const localizedAsset = asset.clone(
                incomingRelationsFromLocalizedAssets
              );
              localizedAsset.url = targetUrl;
              localizedAssets.push(localizedAsset);
            }
          });

          assetGraph.removeListener('addAsset', localizeAsset);
        });
      });

    // Clean up the assets that have had localized versions added if nothing is referring to them any more:
    Object.keys(potentiallyOrphanedAssetsById).forEach(function(assetId) {
      const asset = potentiallyOrphanedAssetsById[assetId];
      if (
        isOriginalHtmlAssetById[assetId] ||
        assetGraph.findRelations({ to: asset }).length === 0
      ) {
        assetGraph.removeAsset(asset);
      }
    });
  };
};
