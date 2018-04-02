module.exports = function tokenizePattern(pattern) {
  if (typeof pattern !== 'string') {
    var valueString = pattern;
    try {
      valueString = JSON.stringify(pattern);
    } catch (e) {}
    throw new Error(
      'i18nTools.tokenizePattern: Value must be a string: ' + valueString
    );
  }
  var tokens = [],
    fragments = pattern.split(/(\{\d+\})/);
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
};
