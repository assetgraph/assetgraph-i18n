#!/usr/bin/env node

/*eslint indent:0*/
var optimist = require('optimist');

var commandLineOptions = optimist
  .usage('$0 --root <inputRootDirectory> [options] <htmlFile(s)>')
  .options('locales', {
    describe: 'Comma-separated list of locales to check',
    type: 'string',
    demand: true
  })
  .options('removeunused', {
    describe: 'Remove unused language keys from .i18n files',
    type: 'boolean'
  })
  .options('ignore', {
    describe:
      "Type(s) of messages to suppress (supported: 'missing', 'untranslated', 'defaultValueMismatch', 'whitespace', 'unused')",
    type: 'string'
  })
  .options('warn', {
    descrbe:
      "Type(s) of messages that should be emitted with 'warning' status (supported: 'missing', 'untranslated', 'defaultValueMismatch', 'whitespace', 'unused'). Intended for use with --stoponwarning",
    type: 'string'
  })
  .options('stoponwarning', {
    describe:
      'Whether to stop with a non-zero exit code when a warning is encountered',
    type: 'boolean',
    default: false
  })
  .options('defaultlocale', {
    describe:
      'The locale of the default value in TR statements and tags with a data-i18n attribute',
    type: 'string',
    default: 'en'
  })
  .wrap(72).argv;

if (commandLineOptions.h) {
  optimist.showHelp();
  process.exit(1);
}

var _ = require('lodash');
var AssetGraph = require('assetgraph');
var i18nTools = require('../lib/i18nTools');
var urlTools = require('urltools');

var rootUrl =
  commandLineOptions.root &&
  urlTools.urlOrFsPathToUrl(commandLineOptions.root, true);

var localeIds =
  commandLineOptions.locales &&
  _.flatten(
    _.flatten([commandLineOptions.locales]).map(function(localeId) {
      return localeId.split(',');
    })
  ).map(i18nTools.normalizeLocaleId);

var defaultLocaleId =
  commandLineOptions.defaultlocale &&
  i18nTools.normalizeLocaleId(commandLineOptions.defaultlocale);

var ignoreMessageTypes =
  commandLineOptions.ignore &&
  _.flatten(
    _.flatten([commandLineOptions.ignore]).map(function(ignoreMessageType) {
      return ignoreMessageType.split(',');
    })
  );

var warnMessageTypes =
  commandLineOptions.warn &&
  _.flatten(
    _.flatten([commandLineOptions.warn]).map(function(warnMessageType) {
      return warnMessageType.split(',');
    })
  );

var includeAttributeNames =
  commandLineOptions.includeattribute &&
  _.flatten(
    _.flatten([commandLineOptions.includeattribute]).map(function(
      attributeName
    ) {
      return attributeName.split(',');
    })
  );

var excludeAttributeNames =
  commandLineOptions.excludeattribute &&
  _.flatten(
    _.flatten([commandLineOptions.excludeattribute]).map(function(
      attributeName
    ) {
      return attributeName.split(',');
    })
  );

var inputUrls;

if (commandLineOptions._.length > 0) {
  inputUrls = commandLineOptions._.map(function(urlOrFsPath) {
    return urlTools.urlOrFsPathToUrl(urlOrFsPath, false);
  });
  if (!rootUrl) {
    rootUrl = urlTools.findCommonUrlPrefix(
      inputUrls.filter(function(inputUrl) {
        return /^file:/.test(inputUrl);
      })
    );
    if (rootUrl) {
      console.warn('Guessing --root from input files: ' + rootUrl);
    }
  }
} else if (rootUrl && /^file:/.test(rootUrl)) {
  inputUrls = [rootUrl + '**/*.html'];
  console.warn('No input files specified, defaulting to ' + inputUrls[0]);
} else {
  throw new Error(
    "No input files and no --root specified (or it isn't file:), cannot proceed"
  );
}

new AssetGraph({ root: rootUrl })
  .logEvents({
    repl: commandLineOptions.repl,
    stopOnWarning: commandLineOptions.stoponwarning,
    suppressJavaScriptCommonJsRequireWarnings: true
  })
  .loadAssets(inputUrls)
  .bundleWebpack()
  .populate({
    from: { type: 'Html' },
    followRelations: { type: 'HtmlScript', to: { url: /^file:/ } }
  })
  .bundleSystemJs({ sourceMaps: true, conditions: { locale: localeIds } })
  .bundleRequireJs({ sourceMaps: true })
  .populate({
    followRelations: {
      $or: [
        {
          to: { type: 'I18n' }
        },
        {
          type: {
            $nin: [
              'HtmlAnchor',
              'HtmlMetaRefresh',
              'SvgAnchor',
              'JavaScriptSourceMappingUrl',
              'JavaScriptSourceUrl'
            ]
          },
          to: { protocol: { $nin: ['http:', 'https:'] } }
        }
      ]
    }
  })
  .queue(
    require('../lib/transforms/checkLanguageKeys')({
      supportedLocaleIds: localeIds,
      defaultLocaleId: defaultLocaleId,
      ignoreMessageTypes: ignoreMessageTypes,
      warnMessageTypes: warnMessageTypes,
      removeUnused: commandLineOptions.removeunused,
      includeAttributeNames: includeAttributeNames,
      excludeAttributeNames: excludeAttributeNames
    })
  )
  .if(commandLineOptions.removeunused)
  .prettyPrintAssets({ type: ['I18n'], isDirty: true })
  .writeAssetsToDisc({ type: ['I18n'], isDirty: true })
  .endif()
  .run();
