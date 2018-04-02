module.exports = function tokenizePattern(pattern) {
  if (typeof pattern !== 'string') {
    let valueString = pattern;
    try {
      valueString = JSON.stringify(pattern);
    } catch (e) {}
    throw new Error(
      'i18nTools.tokenizePattern: Value must be a string: ' + valueString
    );
  }
  const tokens = [], fragments = pattern.split(/(\{\d+\})/);
  for (let i = 0; i < fragments.length; i += 1) {
    const fragment = fragments[i];
    if (fragment.length > 0) {
      const matchPlaceHolder = fragment.match(/^\{(\d+)\}$/);
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
