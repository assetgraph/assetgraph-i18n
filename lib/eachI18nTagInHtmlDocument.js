module.exports = function eachI18nTagInHtmlDocument(
  document,
  lambda,
  nestedTemplateLambda
) {
  var ELEMENT_NODE = 1,
    TEXT_NODE = 3,
    queue = [document],
    i;
  while (queue.length) {
    var node = queue.shift(),
      parentNode = node.parentNode,
      nodeStillInDocument = true;
    if (parentNode && node.nodeType === ELEMENT_NODE) {
      if (node.hasAttribute && node.hasAttribute('data-i18n')) {
        // In IE7 the HTML node doesn't have a hasAttribute method?
        var i18nStr = node.getAttribute('data-i18n'),
          i18nObj;

        if (i18nStr.indexOf(':') !== -1) {
          try {
            i18nObj = eval('({' + i18nStr + '})'); // eslint-disable-line no-eval
          } catch (e) {
            throw new Error(
              'i18nTools.eachI18nTagInHtmlDocument: Error evaluating data-i18n attribute: ' +
                i18nStr +
                '\n' +
                e.stack
            );
          }
        } else {
          i18nObj = { text: i18nStr };
        }

        if (i18nObj.attr) {
          var attributeNames = Object.keys(i18nObj.attr);
          for (i = 0; i < attributeNames.length; i += 1) {
            var attributeName = attributeNames[i],
              key = i18nObj.attr[attributeName] || null;
            if (
              lambda({
                type: 'i18nTagAttribute',
                attributeName: attributeName,
                node: node,
                key: key,
                defaultValue: node.getAttribute(attributeName)
              }) === false
            ) {
              return;
            }
          }
        }

        if (typeof i18nObj.text !== 'undefined') {
          var defaultValue = '',
            placeHolders = [],
            nextPlaceHolderNumber = 0;

          for (i = 0; i < node.childNodes.length; i += 1) {
            var childNode = node.childNodes[i];
            if (childNode.nodeType === TEXT_NODE) {
              defaultValue += childNode.nodeValue;
            } else {
              defaultValue += '{' + nextPlaceHolderNumber + '}';
              nextPlaceHolderNumber += 1;
              placeHolders.push(childNode);
            }
          }
          defaultValue = defaultValue.replace(/^[ \n\t]+|[ \n\t]+$/g, ''); // Trim leading and trailing whitespace, except non-breaking space chars
          defaultValue = defaultValue.replace(/[ \n\t]+/g, ' '); // Compress and normalize sequences of 1+ spaces to one ' '
          if (
            lambda({
              type: 'i18nTagText',
              node: node,
              key: i18nObj.text || null,
              defaultValue: defaultValue,
              placeHolders: placeHolders
            }) === false
          ) {
            return;
          }
        } else {
          // A tag with a data-i18n tag, but no language key for the text contents.
          // Give the lambda a chance to clean up the tag anyway:
          lambda({ node: node });
        }
        if (!node.parentNode) {
          nodeStillInDocument = false;
          queue.unshift(parentNode);
        }
      }
      // Give the caller a chance to do something about nested <script type="text/html">...</script> templates (used by TRHTML in the browser):
      if (
        nestedTemplateLambda &&
        node.nodeName.toLowerCase() === 'script' &&
        node.getAttribute('type') === 'text/html'
      ) {
        nestedTemplateLambda(node);
      }
    }
    if (nodeStillInDocument && node.childNodes) {
      for (i = node.childNodes.length - 1; i >= 0; i -= 1) {
        queue.unshift(node.childNodes[i]);
      }
    }
  }
};
