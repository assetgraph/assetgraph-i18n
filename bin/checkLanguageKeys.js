#!/usr/bin/env node

/*eslint indent:0*/
const optimist = require('optimist');

const commandLineOptions = optimist
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

const _ = require('lodash');
const AssetGraph = require('assetgraph');
const i18nTools = require('../lib/i18nTools');
const urlTools = require('urltools');

let rootUrl =
  commandLineOptions.root &&
  urlTools.urlOrFsPathToUrl(commandLineOptions.root, true);

const localeIds =
  commandLineOptions.locales &&
  _.flatten(
    _.flatten([commandLineOptions.locales]).map(localeId => localeId.split(','))
  ).map(i18nTools.normalizeLocaleId);

const defaultLocaleId =
  commandLineOptions.defaultlocale &&
  i18nTools.normalizeLocaleId(commandLineOptions.defaultlocale);

const ignoreMessageTypes =
  commandLineOptions.ignore &&
  _.flatten(
    _.flatten([commandLineOptions.ignore]).map(ignoreMessageType =>
      ignoreMessageType.split(',')
    )
  );

const warnMessageTypes =
  commandLineOptions.warn &&
  _.flatten(
    _.flatten([commandLineOptions.warn]).map(warnMessageType =>
      warnMessageType.split(',')
    )
  );

const includeAttributeNames =
  commandLineOptions.includeattribute &&
  _.flatten(
    _.flatten([commandLineOptions.includeattribute]).map(attributeName =>
      attributeName.split(',')
    )
  );

const excludeAttributeNames =
  commandLineOptions.excludeattribute &&
  _.flatten(
    _.flatten([commandLineOptions.excludeattribute]).map(attributeName =>
      attributeName.split(',')
    )
  );

let inputUrls;

if (commandLineOptions._.length > 0) {
  inputUrls = commandLineOptions._.map(urlOrFsPath =>
    urlTools.urlOrFsPathToUrl(urlOrFsPath, false)
  );
  if (!rootUrl) {
    rootUrl = urlTools.findCommonUrlPrefix(
      inputUrls.filter(inputUrl => /^file:/.test(inputUrl))
    );
    if (rootUrl) {
      console.warn(`Guessing --root from input files: ${rootUrl}`);
    }
  }
} else if (rootUrl && /^file:/.test(rootUrl)) {
  inputUrls = [`${rootUrl}**/*.html`];
  console.warn(`No input files specified, defaulting to ${inputUrls[0]}`);
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
      defaultLocaleId,
      ignoreMessageTypes,
      warnMessageTypes,
      removeUnused: commandLineOptions.removeunused,
      includeAttributeNames,
      excludeAttributeNames
    })
  )
  .if(commandLineOptions.removeunused)
  .prettyPrintAssets({ type: ['I18n'], isDirty: true })
  .writeAssetsToDisc({ type: ['I18n'], isDirty: true })
  .endif()
  .run();
