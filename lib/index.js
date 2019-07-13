const i18nTools = require('./i18nTools');
const assetGraphConditions = require('assetgraph/lib/assetGraphConditions');

module.exports = function i18n(assetGraph, buildProductionOptions) {
  const defaultLocaleId = 'en_us'; // Make configurable?
  let supportedLocaleIds =
    buildProductionOptions.conditions &&
    buildProductionOptions.conditions.locale;
  if (typeof supportedLocaleIds === 'string') {
    supportedLocaleIds = [supportedLocaleIds];
  }

  if (Array.isArray(supportedLocaleIds)) {
    assetGraph.on('afterTransform', function(transform) {
      if (transform.name === 'inlineHtmlTemplates') {
        // Note: This only works in the afterTransform handler because these particular transforms are synchronous:
        assetGraph
          .findAssets({ type: 'Html', isFragment: false, isInline: false })
          .forEach(function(htmlAsset) {
            const documentElement = htmlAsset.parseTree.documentElement;
            const parsedDataSystemJsConditionals =
              documentElement && assetGraphConditions.parse(documentElement);
            const localeId =
              parsedDataSystemJsConditionals &&
              parsedDataSystemJsConditionals.locale;
            if (localeId) {
              documentElement.setAttribute('lang', localeId);
              const assetsToLocalize = [htmlAsset];
              assetGraph
                .findRelations({
                  from: htmlAsset,
                  type: 'HtmlInlineScriptTemplate',
                  to: { type: 'Html' }
                })
                .forEach(function(htmlInlineTemplate) {
                  assetsToLocalize.push(htmlInlineTemplate.to);
                });
              assetsToLocalize.forEach(function(asset) {
                i18nTools.eachI18nTagInHtmlDocument(
                  asset.parseTree,
                  i18nTools.createI18nTagReplacer({
                    allKeysForLocale: i18nTools.extractAllKeysForLocale(
                      assetGraph,
                      localeId
                    ),
                    localeId: localeId,
                    defaultLocaleId: defaultLocaleId
                  })
                );
                asset.markDirty();
              });
            }
          });

        assetGraph
          .findRelations({ to: { type: 'I18n' } })
          .forEach(function(relation) {
            relation.detach();
            if (
              relation.to.isAsset &&
              relation.to.incomingRelations.length === 0
            ) {
              assetGraph.removeAsset(relation.to);
            }
          });
      }
    });
  }
};
