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
  var localeIds = [localeId];
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
      throw new Error(
        'i18nTools.tokenizePattern: Value must be a string: ' + valueString
      );
    }
    var tokens = [];
    var fragments = pattern.split(/(\{\d+\})/);
    for (var i = 0; i < fragments.length; i += 1) {
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

  var TR = function(key, defaultValue) {
    return localeData[key] || defaultValue || '[!' + key + '!]';
  };

  var tr = TR; // Avoid triggering "i18nTools.eachTrInAst: Invalid TR key name syntax: TR(key, defaultPattern)"

  TR.PAT = function(key, defaultPattern) {
    var pattern = tr(key, defaultPattern);
    var tokens = tokenizePattern(pattern);
    return function() {
      // placeHolderValue, ...
      var placeHolderValues = arguments;

      var renderedString = '';
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

  TR.HTML = function(htmlString) {
    var div = document.createElement('div');
    div.innerHTML = htmlString;
    require('i18n/lib/eachI18nTagInHtmlDocument')(
      div,
      require('i18n/lib/createI18nTagReplacer')({
        allKeysForLocale: localeData,
        keepI18nAttributes: true,
        keepSpans: true
      }),
      function nestedTemplateHandler(node) {
        if (node.firstChild && node.firstChild.nodeType === node.TEXT_NODE) {
          // Use window.TRHTML instead of TRHTML to prevent the recursive call from being recognized as a relation:
          node.firstChild.nodeValue = window.TR.HTML(node.firstChild.nodeValue);
        }
      }
    );
    return div.innerHTML;
  };

  return TR;
}

function gatherKeysForLocale(source, locale) {
  var prioritizedLocale = expandLocaleIdToPrioritizedList(locale);
  return Object.keys(source).reduce(function(data, key) {
    for (var i = 0; i < prioritizedLocale.length; i += 1) {
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
  fetch: function(load, fetch) {
    load.metadata.newAddress = load.address.replace(/\.([^.]+)\.i18n/, function(
      str,
      matchedLocale
    ) {
      load.metadata.locale = matchedLocale;
      return '.i18n';
    });
    return fetch({ address: load.metadata.newAddress, metadata: {} });
  },

  translate: function(load) {
    if (this.builder) {
      load.metadata.format = 'cjs';
      load.metadata.originalSource = load.source;
      return (
        'module.exports = (' +
        createTr.toString() +
        ')(' +
        JSON.stringify(
          gatherKeysForLocale(JSON.parse(load.source), load.metadata.locale)
        ) +
        ');'
      );
    }
  },

  instantiate: function(load) {
    if (!this.builder) {
      return createTr(
        gatherKeysForLocale(JSON.parse(load.source), load.metadata.locale)
      );
    }
  },

  listAssets: function(loads) {
    var isSeenByNewAddress = {};
    var i18nAssets = [];
    loads.forEach(function(load) {
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
