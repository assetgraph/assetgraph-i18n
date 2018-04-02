#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const AssetGraph = require('assetgraph');
const i18nTools = require('../lib/i18nTools');
const urlTools = require('urltools');
const mkpathSync = require('../lib/mkpathSync');
const pluralsCldr = require('plurals-cldr');

const commandLineOptions = require('optimist')
  .usage(
    '$0 --i18n <pathToI18nFile> [--all] [--defaultlocale <localeId>] --babeldir=<dirForBabelFiles> --root <inputRootDirectory> --locales <localeId>,... <htmlFile>...'
  )
  .boolean('all')
  .demand(['root', 'locales', 'babeldir', 'i18n']).argv;

const localeIds =
  commandLineOptions.locales &&
  _.flatten(
    _.flatten([commandLineOptions.locales]).map(function(localeId) {
      return localeId.split(',');
    })
  ).map(i18nTools.normalizeLocaleId);

const initialAssetUrls = commandLineOptions._.map(urlTools.fsFilePathToFileUrl);
let defaultLocaleId;
let i18nUrl;

if (commandLineOptions.defaultlocale) {
  defaultLocaleId = i18nTools.normalizeLocaleId(
    commandLineOptions.defaultlocale
  );
  if (localeIds && localeIds.indexOf(defaultLocaleId) === -1) {
    throw new Error(
      `The default locale id (${defaultLocaleId}) is not among the locales listed with the --locales switch (${localeIds.join(', ')})`
    );
  }
} else if (localeIds) {
  defaultLocaleId = localeIds[0];
}

if (commandLineOptions.i18n) {
  i18nUrl = urlTools.fsFilePathToFileUrl(commandLineOptions.i18n);
  initialAssetUrls.push(i18nUrl);
}

mkpathSync(commandLineOptions.babeldir);

function coalescePluralsToLocale(value, localeId, pluralFormsToInclude) {
  return (function traverse(obj) {
    if (Array.isArray(obj)) {
      return obj.map(traverse);
    } else if (typeof obj === 'object' && obj !== null) {
      const coalescedObj = {};
      let keys = Object.keys(obj);
      if (
        keys.length > 0 &&
        keys.every(function(key) {
          return (
            ['zero', 'one', 'two', 'few', 'many', 'other'].indexOf(key) !== -1
          );
        })
      ) {
        keys = [];
        pluralsCldr.forms(localeId).forEach(function(pluralForm) {
          if (
            !pluralFormsToInclude ||
            pluralFormsToInclude === pluralForm ||
            pluralFormsToInclude.indexOf(pluralForm) !== -1
          ) {
            coalescedObj[pluralForm] = obj[pluralForm];
            keys.push(pluralForm);
          }
        });
        obj = coalescedObj;
      }
      keys.forEach(function(propertyName) {
        coalescedObj[propertyName] = traverse(obj[propertyName]);
      });
      return coalescedObj;
    } else {
      return obj;
    }
  })(value);
}

function valueContainsPlurals(obj) {
  if (Array.isArray(obj)) {
    return obj.some(valueContainsPlurals);
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    if (
      keys.length > 0 &&
      keys.every(function(key) {
        return (
          ['zero', 'one', 'two', 'few', 'many', 'other'].indexOf(key) !== -1
        );
      })
    ) {
      return true;
    } else {
      return keys.some(function(key) {
        return valueContainsPlurals(obj[key]);
      });
    }
  } else {
    return false;
  }
}

function nullIfNullOrUndefined(val) {
  if (val === null || typeof val === 'undefined') {
    return null;
  } else {
    return val;
  }
}

function nullOutLeaves(obj, undefinedOnly) {
  if (Array.isArray(obj)) {
    return obj.map(function(item) {
      return nullOutLeaves(item, undefinedOnly);
    });
  } else if (typeof obj === 'object' && obj !== null) {
    const resultObj = {};
    Object.keys(obj).forEach(function(propertyName) {
      resultObj[propertyName] = nullOutLeaves(obj[propertyName], undefinedOnly);
    });
    return resultObj;
  } else if (typeof obj === 'undefined' || !undefinedOnly) {
    return null;
  } else {
    return obj;
  }
}

function getLeavesFrom(obj, otherObject) {
  if (Array.isArray(obj)) {
    return obj.map(function(item, i) {
      return getLeavesFrom(
        item,
        Array.isArray(otherObject)
          ? nullIfNullOrUndefined(otherObject[i])
          : null
      );
    });
  } else if (typeof obj === 'object' && obj !== null) {
    const resultObj = {};
    Object.keys(obj).forEach(function(propertyName) {
      resultObj[propertyName] = getLeavesFrom(
        obj[propertyName],
        otherObject && typeof otherObject === 'object'
          ? nullIfNullOrUndefined(otherObject[propertyName])
          : null
      );
    });
    return resultObj;
  } else {
    return obj;
  }
}

function flattenKey(key, value) {
  const valueByFlattenedKey = {};
  const path = [];
  (function traverse(obj) {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i += 1) {
        path.push(i);
        traverse(obj[i]);
        path.pop();
      }
    } else if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(function(propertyName) {
        path.push(propertyName);
        traverse(obj[propertyName]);
        path.pop();
      });
    } else {
      // Assume a type that can be stringified using String(obj):
      valueByFlattenedKey[
        key +
          path
            .map(function(pathComponent) {
              return `[${pathComponent}]`;
            })
            .join('')
      ] = obj;
    }
  })(value);
  return valueByFlattenedKey;
}

const pluralFormsInTheDefaultLocale = pluralsCldr.forms(defaultLocaleId);

const relevantPluralFormsNotInTheDefaultLocale = _.difference(
  _.union.apply(
    _,
    localeIds.map(function(localeId) {
      return pluralsCldr.forms(localeId);
    })
  ),
  pluralFormsInTheDefaultLocale
);

new AssetGraph({ root: commandLineOptions.root })
  .logEvents({
    repl: commandLineOptions.repl,
    stopOnWarning: commandLineOptions.stoponwarning
  })
  .loadAssets(initialAssetUrls)
  .populate({
    from: { type: 'Html' },
    followRelations: { type: 'HtmlScript', to: { url: /^file:/ } }
  })
  .bundleSystemJs({
    conditions: { 'locale.js': defaultLocaleId, locale: defaultLocaleId }
  })
  .bundleRequireJs()
  .serializeSourceMaps()
  .populate({
    startAssets: { type: 'SourceMap' },
    followRelations: { to: { url: /^file:\// } }
  })
  .populate({
    followRelations: {
      type: { $nin: ['HtmlAnchor', 'HtmlMetaRefresh'] },
      to: { url: AssetGraph.query.not(/^https?:/) }
    }
  })
  .queue(
    require('../lib/transforms/checkLanguageKeys')({
      supportedLocaleIds: localeIds,
      defaultLocaleId: defaultLocaleId
    })
  )
  .queue(function exportLanguageKeys(assetGraph) {
  const initialAssets = assetGraph.findAssets({ isInitial: true });
  const occurrencesByKey = i18nTools.findOccurrences(assetGraph, initialAssets);
  const allKeys = i18nTools.extractAllKeys(assetGraph);
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

  const isRelevantInLocaleByFlattenedKeyByLocaleId = {};
  const isRelevantInAnyLocaleByFlattenedKey = {};
  const keyByFlattenedKey = {};
  const isTranslatedByFlattenedKeyByLocaleId = {};

  Object.keys(occurrencesByKey).forEach(function(key) {
    const occurrences = occurrencesByKey[key];
    let defaultValueInTheOccurrence;
    let defaultValue;

    // Look for a default value in the occurrences:
    occurrences.forEach(function(occurrence) {
      // FIXME: Warn about multiple different default values?
      defaultValueInTheOccurrence = occurrence.defaultValue;
    });

    if (key in allKeys && defaultLocaleId in allKeys[key]) {
      defaultValue = allKeys[key][defaultLocaleId];
    } else {
      defaultValue = defaultValueInTheOccurrence;
    }

    localeIds.forEach(function(localeId) {
      let value;
      let isDefaultValue = false;
      if (key in allKeys && localeId in allKeys[key]) {
        value = allKeys[key][localeId];
      } else {
        value = nullOutLeaves(defaultValue);
        isDefaultValue = true;
      }

      isRelevantInLocaleByFlattenedKeyByLocaleId[localeId] =
        isRelevantInLocaleByFlattenedKeyByLocaleId[localeId] || {};
      isTranslatedByFlattenedKeyByLocaleId[localeId] =
        isTranslatedByFlattenedKeyByLocaleId[localeId] || {};
      const flattenedAndCoalesced = flattenKey(
        key,
        coalescePluralsToLocale(value, localeId)
      );

      Object.keys(flattenedAndCoalesced).forEach(function(flattenedKey) {
        isRelevantInLocaleByFlattenedKeyByLocaleId[localeId][
          flattenedKey
        ] = true;
        const value = flattenedAndCoalesced[flattenedKey];
        isTranslatedByFlattenedKeyByLocaleId[localeId][flattenedKey] =
          !isDefaultValue && typeof value !== 'undefined';
        isRelevantInAnyLocaleByFlattenedKey[flattenedKey] = true;
        keyByFlattenedKey[flattenedKey] = key;
      });
    });
  });

  const alreadyTranslatedByFlattenedKey = {};
  Object.keys(keyByFlattenedKey).forEach(function(flattenedKey) {
    alreadyTranslatedByFlattenedKey[flattenedKey] = localeIds.every(function(
      localeId
    ) {
      return (
        !isRelevantInLocaleByFlattenedKeyByLocaleId[localeId][flattenedKey] ||
        isTranslatedByFlattenedKeyByLocaleId[localeId][flattenedKey]
      );
    });
  });

  const alreadyTranslatedByKey = {};
  Object.keys(keyByFlattenedKey).forEach(function(flattenedKey) {
    const key = keyByFlattenedKey[flattenedKey];
    if (alreadyTranslatedByKey[key] !== false) {
      alreadyTranslatedByKey[key] =
        alreadyTranslatedByFlattenedKey[flattenedKey] || false;
    }
  });

  localeIds.forEach(function(localeId) {
    let babelSrc = '';

    const isDefaultLocale =
      localeId === defaultLocaleId ||
      localeId.indexOf(`${defaultLocaleId}_`) === 0;

    const keys = Object.keys(occurrencesByKey).sort(function(a, b) {
      const aLowerCase = a.toLowerCase(), bLowerCase = b.toLowerCase();
      return aLowerCase < bLowerCase ? -1 : aLowerCase > bLowerCase ? 1 : 0;
    });

    keys.forEach(function(key) {
      const occurrences = occurrencesByKey[key];
      let omitExistingValues = false;
      let value;
      let defaultValue;
      let defaultValueInTheOccurrence;

      // Look for a default value in the occurrences:
      occurrences.forEach(function(occurrence) {
        // FIXME: Warn about multiple different default values?
        defaultValueInTheOccurrence = occurrence.defaultValue;
      });

      if (key in allKeys && defaultLocaleId in allKeys[key]) {
        defaultValue = allKeys[key][defaultLocaleId];
      } else {
        defaultValue = defaultValueInTheOccurrence;
      }

      if (key in allKeys && localeId in allKeys[key]) {
        value = allKeys[key][localeId];
      } else if (defaultValue && localeId.indexOf(defaultLocaleId) === 0) {
        value = defaultValue;
      } else if (defaultValue) {
        value = defaultValue;
        // Use the defaultValue to figure out which babel keys to flatten it to (only relevant for structured values):
        omitExistingValues = true;
      } else {
        value = null;
      }

      const valueByFlattenedKey = flattenKey(key, value);
      let defaultValueInTheOccurrenceByFlattenedKey;
      let flattenedKeysThatMustBePresent = Object.keys(valueByFlattenedKey);
      // Make sure that all the flattened keys from the actual occurrence are present:
      if (typeof defaultValueInTheOccurrence !== 'undefined') {
        defaultValueInTheOccurrence = coalescePluralsToLocale(
          defaultValueInTheOccurrence,
          localeId
        );
        defaultValueInTheOccurrenceByFlattenedKey = flattenKey(
          key,
          defaultValueInTheOccurrence
        );
        flattenedKeysThatMustBePresent = _.union(
          Object.keys(defaultValueInTheOccurrenceByFlattenedKey),
          flattenedKeysThatMustBePresent
        );
      }

      let keyNeedsTranslation = false;
      flattenedKeysThatMustBePresent.forEach(function(flattenedKey) {
        if (
          alreadyTranslatedByFlattenedKey[flattenedKey] &&
          !commandLineOptions.all &&
          (!isDefaultLocale ||
            alreadyTranslatedByKey[keyByFlattenedKey[flattenedKey]])
        ) {
          return;
        }
        let value = valueByFlattenedKey[flattenedKey];
        if (
          typeof value === 'undefined' &&
          defaultValueInTheOccurrenceByFlattenedKey &&
          isDefaultLocale
        ) {
          value = defaultValueInTheOccurrenceByFlattenedKey[flattenedKey];
        }
        babelSrc +=
          `${flattenedKey}=${omitExistingValues
  ? ''
  : String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')}\n`;
        keyNeedsTranslation = true;
      });

      if (
        keyNeedsTranslation &&
        isDefaultLocale &&
        relevantPluralFormsNotInTheDefaultLocale.length > 0 &&
        valueContainsPlurals(value)
      ) {
        const localeIdsByFlattenedKey = {};
        relevantPluralFormsNotInTheDefaultLocale.forEach(function(
          pluralForm
        ) {
          localeIds.forEach(function(localeId) {
            if (pluralsCldr.forms(localeId).indexOf(pluralForm) !== -1) {
              const valueByFlattenedKey = flattenKey(
                  key,
                  nullOutLeaves(
                    coalescePluralsToLocale(
                      defaultValueInTheOccurrence,
                      localeId,
                      pluralForm
                    )
                  )
                );

              const existingTranslationByFlattenedKey =
                allKeys[key] && localeId in allKeys[key]
                  ? flattenKey(key, allKeys[key][localeId])
                  : {};

              Object.keys(valueByFlattenedKey).forEach(function(
                flattenedKey
              ) {
                if (!(flattenedKey in existingTranslationByFlattenedKey)) {
                  (localeIdsByFlattenedKey[flattenedKey] =
                    localeIdsByFlattenedKey[flattenedKey] || []).push(
                    localeId
                  );
                }
              });
            }
          });
        });
        const flattenedKeysByJoinedLocaleIds = {};
        Object.keys(localeIdsByFlattenedKey).forEach(function(flattenedKey) {
          const localeIds = localeIdsByFlattenedKey[flattenedKey];
          localeIds.sort();
          (flattenedKeysByJoinedLocaleIds[localeIds.join(',')] =
            flattenedKeysByJoinedLocaleIds[localeIds.join(',')] || []).push(
            flattenedKey
          );
        });

        Object.keys(flattenedKeysByJoinedLocaleIds).forEach(function(
          joinedLocaleIds
        ) {
          const flattenedKeys = flattenedKeysByJoinedLocaleIds[joinedLocaleIds];
          const localeIds = joinedLocaleIds.split(',');
          babelSrc +=
            `# NOTE: The language${localeIds.length > 1 ? 's ' : ' '}${localeIds.join(', ')}${localeIds.length > 1 ? ' need' : ' needs'}${flattenedKeys.length > 1
  ? ' these additional keys'
  : ' this additional key'} to cover all plural forms:\n${flattenedKeys
  .map(function(flattenedKey) {
    return `# ${flattenedKey}=\n`;
  })
  .join('')}`;
        });
      }

      const i18nAssetForKey =
        assetGraph.findAssets({
          type: 'I18n',
          isLoaded: true,
          parseTree: function(parseTree) {
            return key in parseTree;
          }
        })[0] || i18nAssetForAllKeys;

      if (i18nAssetForKey) {
        if (!(key in i18nAssetForKey.parseTree)) {
          i18nAssetForKey.parseTree[key] = {};
          i18nAssetForKey.markDirty();
        }
        i18nAssetForKey.parseTree[key] = i18nAssetForKey.parseTree[key] || {};
        let newValue;
        if (!(localeId in i18nAssetForKey.parseTree[key])) {
          if (localeId.indexOf(defaultLocaleId) === 0) {
            i18nAssetForKey.parseTree[key][localeId] = defaultValue;
          } else {
            if (omitExistingValues) {
              newValue = nullOutLeaves(
                coalescePluralsToLocale(value, localeId)
              );
            } else {
              newValue = getLeavesFrom(
                coalescePluralsToLocale(defaultValue, localeId),
                value
              );
            }
            i18nAssetForKey.parseTree[key][localeId] = newValue;
          }
          i18nAssetForKey.markDirty();
        } else {
          const existingValue = i18nAssetForKey.parseTree[key][localeId];
          newValue = nullOutLeaves(
            coalescePluralsToLocale(existingValue, localeId),
            true
          );
          i18nAssetForKey.parseTree[key][localeId] = newValue;
          i18nAssetForKey.markDirty();
        }
      }
    });
    const targetBabelFileName = path.resolve(
      commandLineOptions.babeldir,
      `${localeId}.txt`
    );
    if (babelSrc.length) {
      console.warn(`Writing ${targetBabelFileName}`);
      fs.writeFileSync(targetBabelFileName, babelSrc, 'utf-8');
    } else {
      console.warn(
        `No existing keys for ${localeId}, not writing ${targetBabelFileName}`
      );
    }
  });
})
  .prettyPrintAssets({ type: 'I18n', isDirty: true })
  .writeAssetsToDisc({ type: 'I18n', isDirty: true })
  .run();
