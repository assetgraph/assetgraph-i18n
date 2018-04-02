#!/usr/bin/env node

/*eslint indent:0*/
const path = require('path');

const fs = require('fs');
const util = require('util');
const _ = require('lodash');
const AssetGraph = require('assetgraph');
const i18nTools = require('../lib/i18nTools');
const pluralsCldr = require('plurals-cldr');
const urlTools = require('urltools');

const commandLineOptions = require('optimist')
  .usage(
    '$0 --i18n <pathToI18nFile> [--locales <localeId>[,<localeId>...]] [--defaultlocale <localeId>] --babeldir=<dirContainingTheBabelFilesToApply> --root <inputRootDirectory> <htmlFile>...'
  )
  .options('defaultlocale', {
    describe:
      'The locale of the default value in TR statements and tags with a data-i18n attribute',
    type: 'string',
    default: 'en'
  })
  .options('replace', {
    describe:
      'Replace the data-i18n attributes, TR and TRPAT expressions in the original source code with the default locale keys in the translation job (experimental)',
    type: 'boolean',
    default: false
  })
  .demand(['root', 'babeldir', 'i18n']).argv;

const localeIds =
  commandLineOptions.locales &&
  _.flatten(
    _.flatten([commandLineOptions.locales]).map(localeId => localeId.split(','))
  ).map(i18nTools.normalizeLocaleId);

const initialAssetUrls = commandLineOptions._.map(urlTools.fsFilePathToFileUrl);
const originalTextByAssetId = {};
let defaultLocaleId;
let i18nUrl;

if (commandLineOptions.defaultlocale) {
  defaultLocaleId = i18nTools.normalizeLocaleId(
    commandLineOptions.defaultlocale
  );
  if (localeIds && localeIds.indexOf(defaultLocaleId) === -1) {
    throw new Error(
      `The default locale id (${defaultLocaleId}) is not among the locales listed with the --locales switch (${localeIds.join(
        ', '
      )})`
    );
  }
} else if (localeIds) {
  defaultLocaleId = localeIds[0];
}

function isArrayOrObject(obj) {
  return Array.isArray(obj) || (obj && typeof obj === 'object');
}

if (commandLineOptions.i18n) {
  i18nUrl = urlTools.fsFilePathToFileUrl(commandLineOptions.i18n);
  initialAssetUrls.push(i18nUrl);
}

(async () => {
  const assetGraph = new AssetGraph({ root: commandLineOptions.root });
  assetGraph.on('addAsset', asset => {
    asset.once('load', () => {
      originalTextByAssetId[asset.id] = asset.text;
    });
  });
  await assetGraph.logEvents({
    repl: commandLineOptions.repl,
    stopOnWarning: commandLineOptions.stoponwarning,
    suppressJavaScriptCommonJsRequireWarnings: true
  });
  await assetGraph.loadAssets(initialAssetUrls);
  await assetGraph.populate({
    from: { type: 'Html' },
    followRelations: { type: 'HtmlScript', to: { url: /^file:/ } }
  });
  await assetGraph.bundleSystemJs({
    sourceMaps: true,
    conditions: { 'locale.js': defaultLocaleId, locale: defaultLocaleId }
  });
  await assetGraph.bundleRequireJs({ sourceMaps: true });
  await assetGraph.populate({
    startAssets: { type: 'JavaScript' },
    followRelations: { to: { url: /^file:\// } }
  });
  await assetGraph.serializeSourceMaps();
  await assetGraph.populate({
    startAssets: { type: 'SourceMap' },
    followRelations: { to: { url: /^file:\// } }
  });
  await assetGraph.populate({
    followRelations: {
      type: { $nin: ['HtmlAnchor', 'HtmlMetaRefresh'] },
      to: { protocol: { $nin: ['https:', 'http:'] } }
    }
  });

  const translationsByKeyAndLocaleId = {};

  const occurrencesByKey = i18nTools.findOccurrences(
    assetGraph,
    assetGraph.findAssets({ type: 'Html', isInitial: true })
  );

  let i18nAssetForAllKeys;

  if (i18nUrl) {
    i18nAssetForAllKeys = assetGraph.findAssets({ url: i18nUrl })[0];
    if (!i18nAssetForAllKeys) {
      i18nAssetForAllKeys = new AssetGraph.I18n({
        url: i18nUrl,
        isDirty: true,
        parseTree: {}
      });
      assetGraph.addAsset(i18nAssetForAllKeys);
      assetGraph.emit(
        'info',
        `--i18n ${commandLineOptions.i18n} not found, creating it`
      );
    } else if (!i18nAssetForAllKeys.isLoaded) {
      i18nAssetForAllKeys.parseTree = {};
    }
  }

  const isSeenByLocaleId = {};

  fs.readdirSync(commandLineOptions.babeldir).forEach(fileName => {
    if (fileName === 'SOURCE.txt') {
      console.warn(`Skipping ${fileName}`);
    } else {
      const matchLocaleId = fileName.match(
        /^([a-zA-Z0-9\-\_]+)\.(?:txt|babel)$/
      );
      if (matchLocaleId) {
        const localeId = i18nTools.normalizeLocaleId(matchLocaleId[1]);

        const babelBody = fs.readFileSync(
          path.resolve(commandLineOptions.babeldir, fileName),
          'utf-8'
        );

        isSeenByLocaleId[localeId] = true;

        if (localeIds && localeIds.indexOf(localeId) === -1) {
          console.warn(
            `Skipping ${fileName} because ${localeId} was not mentioned in --locales`
          );
          return;
        }

        babelBody.split(/\r?\n|\r\n?/).forEach((line, lineNumber) => {
          if (!/^\s*\#|^\s*$/.test(line)) {
            // Skip comments and empty lines
            const matchKeyValue = line.match(/^([^=]+)=(.*)$/);
            if (matchKeyValue) {
              let key = matchKeyValue[1].trim();

              let value = matchKeyValue[2]
                .trim()
                .replace(/\\([n\\])/g, ($0, ch) => (ch === 'n' ? '\n' : ch));

              const path = [];

              // If the value looks like a number, we want it to be a number in our JSON representation
              if (/^(?:[1-9][0-9]*(?:\.[0-9]*)?)$/.test(value)) {
                // Doesn't match ".nnn", "n." or exponential notation (on purpose)
                value = parseFloat(value);
              }
              // Chop off [x][y]... suffix and note the components in the 'path' array
              key = key.replace(/\[([^\]]+)\]/g, ($0, pathComponent) => {
                path.push(pathComponent);
                return '';
              });
              if (!(key in translationsByKeyAndLocaleId)) {
                translationsByKeyAndLocaleId[key] = {};
              }
              path.unshift(localeId);
              let cursor = translationsByKeyAndLocaleId[key];
              while (path.length > 1) {
                if (/^(?:[0-9]|[1-9][0-9]*)$/.test(path[1])) {
                  // Integer path component, assume that cursor[nextIndex] should be an array
                  if (typeof cursor[path[0]] === 'undefined') {
                    cursor[path[0]] = [];
                  } else if (!Array.isArray(cursor[path[0]])) {
                    throw new Error(
                      `Error: Expected ${JSON.stringify(cursor)}['${
                        path[0]
                      }'] to be undefined or an array while processing line ${lineNumber} of ${fileName}:\n${line}`
                    );
                  }
                } else {
                  // typeof path[1] === 'string', assume that cursor[path[0]] should be an object
                  if (typeof cursor[path[0]] === 'undefined') {
                    cursor[path[0]] = {};
                  } else if (
                    typeof cursor[path[0]] !== 'object' ||
                    cursor[path[0]] === null
                  ) {
                    throw new Error(
                      `Error: Expected ${JSON.stringify(cursor)}['${
                        path[0]
                      }'] to be undefined or an object while processing line ${lineNumber} of ${fileName}:\n${line}`
                    );
                  }
                }
                cursor = cursor[path.shift()];
              }
              if (path[0] in cursor) {
                throw new Error(
                  `Error: Found double declaration of key in line ${lineNumber} of ${fileName}:\n${line}`
                );
              }
              cursor[path[0]] = value;
            } else {
              console.warn(
                `Couldn't parse line ${lineNumber +
                  1} of the ${localeId} file: ${line}`
              );
            }
          }
        });
      } else {
        console.warn(
          `Skipping file whose basename does not look like a locale id: ${fileName}`
        );
      }
    }
  });
  if (localeIds) {
    localeIds.forEach(localeId => {
      if (!isSeenByLocaleId[localeId]) {
        console.warn(
          `${localeId}.txt was not found although --locales ${localeId} was specified`
        );
      }
    });
  }
  const secondaryI18nAssets = assetGraph
    .findAssets({
      type: 'I18n',
      isLoaded: true
    })
    .filter(asset => asset !== i18nAssetForAllKeys);

  Object.keys(translationsByKeyAndLocaleId).forEach(key => {
    const translationsByLocaleId = translationsByKeyAndLocaleId[key];
    Object.keys(translationsByLocaleId).forEach(localeId => {
      const value = translationsByLocaleId[localeId];
      // Mostly copied from coalescePluralsToLocale
      translationsByLocaleId[localeId] = (function traverse(obj) {
        if (Array.isArray(obj)) {
          return obj.map(traverse);
        } else if (typeof obj === 'object' && obj !== null) {
          const coalescedObj = {};
          let keys = Object.keys(obj);
          if (
            keys.length > 0 &&
            keys.every(
              key =>
                ['zero', 'one', 'two', 'few', 'many', 'other'].indexOf(key) !==
                -1
            )
          ) {
            keys = [];
            pluralsCldr.forms(localeId).forEach(pluralForm => {
              coalescedObj[pluralForm] = obj[pluralForm];
              keys.push(pluralForm);
            });
            if (Object.keys(obj).length > keys.length) {
              console.log(
                `${key}: Discarding plural forms not used in ${localeId}:`,
                obj,
                '=>',
                coalescedObj
              );
            }
            obj = coalescedObj;
          }
          keys.forEach(propertyName => {
            coalescedObj[propertyName] = traverse(obj[propertyName]);
          });
          return coalescedObj;
        } else {
          return obj;
        }
      })(value);
    });
  });

  Object.keys(translationsByKeyAndLocaleId).forEach(key => {
    let i18nAsset;
    if (!(key in i18nAssetForAllKeys.parseTree)) {
      // Even if a i18nAssetForAllKeys (--i18n ...) is defined, another .i18n we should prefer another file with that key already defined:
      if (secondaryI18nAssets.length > 0) {
        for (let i = 0; i < secondaryI18nAssets.length; i += 1) {
          if (key in secondaryI18nAssets[i].parseTree) {
            i18nAsset = secondaryI18nAssets[i];
            break;
          }
        }
      }
      if (!i18nAsset) {
        i18nAsset = i18nAssetForAllKeys;
      }
    } else {
      i18nAsset = i18nAssetForAllKeys;
    }
    if (!(key in i18nAsset.parseTree)) {
      i18nAsset.parseTree[key] = {};
      i18nAsset.markDirty();
    }
    Object.keys(translationsByKeyAndLocaleId[key]).forEach(localeId => {
      const newTranslation = translationsByKeyAndLocaleId[key][localeId];
      const existingTranslation = i18nAsset.parseTree[key][localeId];

      function setMergedTranslation(mergedTranslation) {
        i18nAsset.parseTree[key][localeId] = mergedTranslation;
        i18nAsset.markDirty();
        translationsByKeyAndLocaleId[key][localeId] = mergedTranslation;
      }

      if (
        isArrayOrObject(existingTranslation) &&
        isArrayOrObject(newTranslation)
      ) {
        // Do a 'deep extend' to update existing complex value:
        setMergedTranslation(
          _.merge(
            Array.isArray(newTranslation) ? [] : {},
            existingTranslation,
            newTranslation
          )
        );
      } else if (
        typeof existingTranslation === 'undefined' ||
        isArrayOrObject(existingTranslation) !==
          isArrayOrObject(newTranslation) ||
        existingTranslation !== newTranslation
      ) {
        setMergedTranslation(newTranslation);
      }
    });
  });

  if (commandLineOptions.replace) {
    const allKeysInDefaultLocale = {};
    const replacedTextByAssetId = {};
    Object.keys(translationsByKeyAndLocaleId).forEach(key => {
      i18nTools
        .expandLocaleIdToPrioritizedList(defaultLocaleId)
        .some(localeId => {
          if (localeId in translationsByKeyAndLocaleId[key]) {
            allKeysInDefaultLocale[key] =
              translationsByKeyAndLocaleId[key][localeId];
            return true;
          }
        });
    });

    // Replace data-i18n in Html assets first:
    const i18nTagReplacer = i18nTools.createI18nTagReplacer({
      allKeysForLocale: allKeysInDefaultLocale,
      localeId: defaultLocaleId,
      keepSpans: true,
      keepI18nAttributes: true
    });
    assetGraph.findAssets({ type: 'Html' }).forEach(htmlAsset => {
      let hasOccurrences = false;
      i18nTools.eachI18nTagInHtmlDocument(htmlAsset.parseTree, options => {
        if (
          options.key in allKeysInDefaultLocale &&
          !_.isEqual(options.defaultValue, allKeysInDefaultLocale[options.key])
        ) {
          hasOccurrences = true;
          i18nTagReplacer(options);
        }
      });
      if (hasOccurrences) {
        htmlAsset.hasReplacedLanguageKeys = true;
        htmlAsset.markDirty();
        replacedTextByAssetId[htmlAsset.nonInlineAncestor.id] =
          htmlAsset.nonInlineAncestor.text;
      }
    });

    // Then regexp TR and TRPAT in JavaScript assets. This has to happen last because it regexps directly on the source:
    Object.keys(translationsByKeyAndLocaleId).forEach(key => {
      if (
        defaultLocaleId &&
        defaultLocaleId in translationsByKeyAndLocaleId[key]
      ) {
        const occurrences = occurrencesByKey[key] || [];
        (occurrences || []).forEach(occurrence => {
          if (
            !_.isEqual(
              occurrence.defaultValue,
              allKeysInDefaultLocale[occurrence.key]
            )
          ) {
            if (occurrence.type === 'TR' || occurrence.type === 'TRPAT') {
              const asset = occurrence.asset.nonInlineAncestor;

              const replaceRegExp = new RegExp(
                `(TR(?:PAT)?\\((['"])${key.replace(
                  /[\.\[\]\*\+\?\{\}\(\)\^\$]/g,
                  '\\$&'
                )}\\2\\s*,\\s*)(?:[^)'"]*|"[^"]*"|'[^']*')*?\\)`,
                'g'
              );

              replacedTextByAssetId[asset.id] = (
                replacedTextByAssetId[asset.id] ||
                originalTextByAssetId[asset.id] ||
                asset.text
              ).replace(
                replaceRegExp,
                `$1${util.inspect(
                  translationsByKeyAndLocaleId[key][defaultLocaleId]
                )})`
              );
            }
          }
        });
      }
    });
    Object.keys(replacedTextByAssetId).forEach(assetId => {
      const asset = assetGraph.idIndex[assetId];
      let replacedText = replacedTextByAssetId[assetId];
      asset.keepUnpopulated = true;
      if (asset.type === 'Html') {
        // Un-entitify < > & in data-bind and data-htmlizer attributes (common intentional spec breakage in development):
        asset.keepUnpopulated = true;
        replacedText = replacedText.replace(
          /(?:data-htmlizer|data-bind)="[^"]*"/g,
          $0 =>
            $0
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
        );
      }
      asset._rawSrc = replacedText.toString('utf-8');
      asset.hasReplacedLanguageKeys = true;
    });
  }

  for (const asset of assetGraph.findAssets({ type: 'I18n', isDirty: true })) {
    asset.prettyPrint();
  }
  await assetGraph.writeStatsToStderr();
  await assetGraph.writeAssetsToDisc({ type: 'I18n', isDirty: true });

  if (commandLineOptions.replace) {
    await assetGraph.writeAssetsToDisc({
      type: { $in: ['JavaScript', 'Html'] },
      hasReplacedLanguageKeys: true
    });
  }
})();
