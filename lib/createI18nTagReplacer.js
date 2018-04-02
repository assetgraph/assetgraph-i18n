const tokenizePattern = require('./tokenizePattern');

module.exports = function createI18nTagReplacer(options) {
  const TEXT_NODE = 3, allKeysForLocale = options.allKeysForLocale, keepI18nAttributes = options.keepI18nAttributes, keepSpans = options.keepSpans;

  return function i18nTagReplacer(options) {
    const key = options.key;
    const node = options.node;
    let value = allKeysForLocale[key];

    const removeNode =
      !keepSpans &&
      options.type !== 'i18nTagAttribute' &&
      key !== null &&
      node.nodeName.toLowerCase() === 'span' &&
      node.attributes.length === 1;

    if (key !== null) {
      // An empty string or null means explicitly "do not translate"
      if (
        (/^i18nTag/.test(options.type) && value === null) ||
        typeof value === 'undefined'
      ) {
        value = options.defaultValue || '[!' + key + '!]';
      }
      if (options.type === 'i18nTagAttribute') {
        node.setAttribute(options.attributeName, value);
      } else if (options.type === 'i18nTagText') {
        while (node.childNodes.length) {
          node.removeChild(node.firstChild);
        }
        tokenizePattern(value).forEach(function(token) {
          let nodeToInsert;
          if (token.type === 'text') {
            nodeToInsert = node.ownerDocument.createTextNode(token.value);
          } else {
            const placeHolder = options.placeHolders[token.value];
            if (placeHolder) {
              nodeToInsert = placeHolder;
              if (nodeToInsert.parentNode) {
                nodeToInsert = nodeToInsert.cloneNode(true);
              }
            } else {
              nodeToInsert = node.ownerDocument.createTextNode(
                '[!{' + token.value + '}!]'
              );
            }
          }
          if (removeNode) {
            if (
              nodeToInsert.nodeType === TEXT_NODE &&
              node.previousSibling &&
              node.previousSibling.nodeType === TEXT_NODE
            ) {
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
};
