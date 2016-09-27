var checkLanguageKeys = require('./transforms/checkLanguageKeys');
var i18nTools = require('./i18nTools');

function getParsedDataSystemJsConditionalsFromHtmlElement(node) {
    var dataCond = node.getAttribute('data-assetgraph-conditions');
    if (dataCond) {
        // FIXME: Use object-literal-parse?
        try {
            return eval('({' + dataCond + '})'); // eslint-disable-line no-eval
        } catch (e) {}
    }
}

module.exports = function i18n(assetGraph, buildProductionOptions) {
    var defaultLocaleId = 'en_us'; // Make configurable?
    var supportedLocaleIds = buildProductionOptions.conditions && buildProductionOptions.conditions.locale;

    if (Array.isArray(supportedLocaleIds)) {
        assetGraph.on('afterTransform', function (transform) {
            if (transform.name === 'inlineHtmlTemplates') {
                // Note: This only works in the afterTransform handler because these particular transforms are synchronous:
                assetGraph
                    .queue(checkLanguageKeys({
                        supportedLocaleIds: supportedLocaleIds,
                        defaultLocaleId: defaultLocaleId
                    }))
                    .queue(function translateHtml(assetGraph) {
                        assetGraph.findAssets({type: 'Html', isFragment: false, isInline: false}).forEach(function (htmlAsset) {
                            var localeId;
                            var documentElement = htmlAsset.parseTree.documentElement;
                            var parsedDataSystemJsConditionals = documentElement && getParsedDataSystemJsConditionalsFromHtmlElement(documentElement);
                            localeId = parsedDataSystemJsConditionals && parsedDataSystemJsConditionals.locale;
                            if (localeId) {
                                documentElement.setAttribute('lang', localeId);
                                var assetsToLocalize = [htmlAsset];
                                assetGraph.findRelations({from: htmlAsset, type: 'HtmlInlineScriptTemplate', to: {type: 'Html'}}).forEach(function (htmlInlineTemplate) {
                                    assetsToLocalize.push(htmlInlineTemplate.to);
                                });
                                assetsToLocalize.forEach(function (asset) {
                                    i18nTools.eachI18nTagInHtmlDocument(asset.parseTree, i18nTools.createI18nTagReplacer({
                                        allKeysForLocale: i18nTools.extractAllKeysForLocale(assetGraph, localeId),
                                        localeId: localeId,
                                        defaultLocaleId: defaultLocaleId
                                    }));
                                    asset.markDirty();
                                });
                            }
                        });
                    })
                    .removeRelations({to: {type: 'I18n'}}, {detach: true, removeOrphan: true})
                    .run();
            }
        });
    }
};
