const expect = require('../unexpected-with-plugins');

const childProcess = require('child_process');
const fs = require('fs');
const pathModule = require('path');
const temp = require('temp');

describe('makeBabelJob', function () {
  it('should extract a translation job and set null values in the correct places in the existing i18n files', function (done) {
    const babelDir = temp.mkdirSync();
    const tmpTestCaseCopyDir = temp.mkdirSync();

    const copyCommand = `cp '${pathModule.join(
      __dirname,
      '..',
      '..',
      'testdata',
      'bin',
    )}'/makeBabelJob/complex/* ${tmpTestCaseCopyDir}`;

    childProcess.exec(copyCommand, function (err, stdout, stderr) {
      if (err) {
        return done(
          new Error(
            `${copyCommand} failed: STDERR:${stderr}\nSTDOUT:${stdout}`,
          ),
        );
      }

      const makeBabelJobProcess = childProcess.spawn(
        pathModule.join(__dirname, '..', '..', 'bin', 'makeBabelJob.js'),
        [
          '--babeldir',
          babelDir,
          '--root',
          tmpTestCaseCopyDir,
          '--i18n',
          pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
          pathModule.resolve(tmpTestCaseCopyDir, 'index.html'),
          '--defaultlocale',
          'en',
          '--locales',
          'en,pl,da,de,cs',
        ],
      );

      const buffersByStreamName = {};
      const streamNames = ['stdout', 'stderr'];
      streamNames.forEach(function (streamName) {
        buffersByStreamName[streamName] = [];
        makeBabelJobProcess[streamName].on('data', function (chunk) {
          buffersByStreamName[streamName].push(chunk);
        });
      });

      function getStreamOutputText() {
        let outputText = '';
        streamNames.forEach(function (streamName) {
          if (buffersByStreamName[streamName].length > 0) {
            outputText += `\n${streamName.toUpperCase()}: ${Buffer.concat(
              buffersByStreamName[streamName],
            ).toString('utf-8')}\n`;
          }
        });
        return outputText;
      }

      makeBabelJobProcess.on('exit', function (exitCode) {
        if (exitCode) {
          return done(
            new Error(
              `The makeBabelJob process ended with a non-zero exit code: ${exitCode}${getStreamOutputText()}`,
            ),
          );
        }

        expect(fs.readdirSync(babelDir).sort(), 'to equal', [
          'cs.txt',
          'da.txt',
          'de.txt',
          'en.txt',
          'pl.txt',
        ]);

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'en.txt'), 'utf-8'),
          'to equal',
          [
            'KeyAlreadyPartiallyTranslatedInIndexI18n=Key already partially translated in index.i18n',
            'KeyAlreadyPartiallyTranslatedInOtherI18n=Key already partially translated in other.i18n',
            'KeyAlreadyTranslatedToCzech[one]=foo',
            'KeyAlreadyTranslatedToCzech[other]=foo',
            '# NOTE: The language pl needs these additional keys to cover all plural forms:',
            '# KeyAlreadyTranslatedToCzech[few]=',
            '# KeyAlreadyTranslatedToCzech[many]=',
            'KeyDestinedForIndexI18n=Key destined for index.i18n',
            'NotYetTranslatedKeyWithPluralCases[one]=one week',
            'NotYetTranslatedKeyWithPluralCases[other]={0} weeks',
            '# NOTE: The languages cs, pl need these additional keys to cover all plural forms:',
            '# NotYetTranslatedKeyWithPluralCases[few]=',
            '# NotYetTranslatedKeyWithPluralCases[many]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][one]=one week',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][other]={0} weeks',
            '# NOTE: The languages cs, pl need these additional keys to cover all plural forms:',
            '# NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][few]=',
            '# NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][many]=',
            '',
          ].join('\n'),
        );

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'da.txt'), 'utf-8'),
          'to equal',
          [
            'KeyAlreadyPartiallyTranslatedInIndexI18n=',
            'KeyAlreadyPartiallyTranslatedInOtherI18n=',
            'KeyAlreadyTranslatedToCzech[one]=',
            'KeyAlreadyTranslatedToCzech[other]=',
            'KeyDestinedForIndexI18n=',
            'NotYetTranslatedKeyWithPluralCases[one]=',
            'NotYetTranslatedKeyWithPluralCases[other]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][one]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][other]=',
            '',
          ].join('\n'),
        );

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'de.txt'), 'utf-8'),
          'to equal',
          [
            'KeyAlreadyPartiallyTranslatedInIndexI18n=Existing translation to German',
            'KeyAlreadyPartiallyTranslatedInOtherI18n=Existing translation to German',
            'KeyAlreadyTranslatedToCzech[one]=',
            'KeyAlreadyTranslatedToCzech[other]=',
            'KeyDestinedForIndexI18n=',
            'NotYetTranslatedKeyWithPluralCases[one]=',
            'NotYetTranslatedKeyWithPluralCases[other]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][one]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][other]=',
            '',
          ].join('\n'),
        );

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'cs.txt'), 'utf-8'),
          'to equal',
          [
            'KeyAlreadyPartiallyTranslatedInIndexI18n=',
            'KeyAlreadyPartiallyTranslatedInOtherI18n=',
            'KeyAlreadyTranslatedToCzech[one]=fzd',
            'KeyAlreadyTranslatedToCzech[few]=fzd',
            'KeyAlreadyTranslatedToCzech[many]=fzd',
            'KeyAlreadyTranslatedToCzech[other]=fzd',
            'KeyDestinedForIndexI18n=',
            'NotYetTranslatedKeyWithPluralCases[one]=',
            'NotYetTranslatedKeyWithPluralCases[few]=',
            'NotYetTranslatedKeyWithPluralCases[many]=',
            'NotYetTranslatedKeyWithPluralCases[other]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][one]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][few]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][many]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][other]=',
            '',
          ].join('\n'),
        );

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'pl.txt'), 'utf-8'),
          'to equal',
          [
            'KeyAlreadyPartiallyTranslatedInIndexI18n=',
            'KeyAlreadyPartiallyTranslatedInOtherI18n=',
            'KeyAlreadyTranslatedToCzech[one]=',
            'KeyAlreadyTranslatedToCzech[few]=',
            'KeyAlreadyTranslatedToCzech[many]=',
            'KeyAlreadyTranslatedToCzech[other]=',
            'KeyDestinedForIndexI18n=',
            'NotYetTranslatedKeyWithPluralCases[one]=',
            'NotYetTranslatedKeyWithPluralCases[few]=',
            'NotYetTranslatedKeyWithPluralCases[many]=',
            'NotYetTranslatedKeyWithPluralCases[other]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][one]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][few]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][many]=',
            'NotYetTranslatedKeyWithPluralCasesInNestedStructure[foo][other]=',
            '',
          ].join('\n'),
        );

        expect(
          JSON.parse(
            fs.readFileSync(
              pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
              'utf-8',
            ),
          ),
          'to equal',
          {
            KeyDestinedForIndexI18n: {
              cs: null,
              en: 'Key destined for index.i18n',
              de: null,
              da: null,
              pl: null,
            },
            KeyAlreadyPartiallyTranslatedInIndexI18n: {
              cs: null,
              en: 'Key already partially translated in index.i18n',
              de: 'Existing translation to German',
              da: null,
              pl: null,
            },
            NotYetTranslatedKeyWithPluralCases: {
              cs: { one: null, few: null, many: null, other: null },
              da: { one: null, other: null },
              de: { one: null, other: null },
              en: { one: 'one week', other: '{0} weeks' },
              pl: { one: null, few: null, many: null, other: null },
            },
            NotYetTranslatedKeyWithPluralCasesInNestedStructure: {
              cs: { foo: { one: null, few: null, many: null, other: null } },
              da: { foo: { one: null, other: null } },
              de: { foo: { one: null, other: null } },
              en: { foo: { one: 'one week', other: '{0} weeks' } },
              pl: { foo: { few: null, many: null, one: null, other: null } },
            },
            KeyAlreadyTranslatedToAllLanguages: {
              cs: { one: 'fzd', few: 'fzd', many: 'fzd', other: 'fzd' },
              da: { one: 'føø', other: 'føø' },
              de: { one: 'voo', other: 'voo' },
              en: { one: 'foo', other: 'foo' },
              pl: { one: 'fzz', few: 'fzz', many: 'fzz', other: 'fzz' },
            },
            KeyAlreadyTranslatedToCzech: {
              cs: { one: 'fzd', few: 'fzd', many: 'fzd', other: 'fzd' },
              da: { one: null, other: null },
              de: { one: null, other: null },
              en: { one: 'foo', other: 'foo' },
              pl: { few: null, many: null, one: null, other: null },
            },
          },
        );

        expect(
          JSON.parse(
            fs.readFileSync(
              pathModule.resolve(tmpTestCaseCopyDir, 'other.i18n'),
              'utf-8',
            ),
          ),
          'to equal',
          {
            KeyAlreadyPartiallyTranslatedInOtherI18n: {
              cs: null,
              en: 'Key already partially translated in other.i18n',
              de: 'Existing translation to German',
              da: null,
              pl: null,
            },
          },
        );

        done();
      });
    });
  });

  it('should not do anything if the project is fully translated', function (done) {
    const babelDir = temp.mkdirSync();
    const tmpTestCaseCopyDir = temp.mkdirSync();

    const copyCommand = `cp '${pathModule.join(
      __dirname,
      '..',
      '..',
      'testdata',
      'bin',
    )}'/makeBabelJob/noTranslationsNecessary/* ${tmpTestCaseCopyDir}`;

    childProcess.exec(copyCommand, function (err, stdout, stderr) {
      if (err) {
        return done(
          new Error(
            `${copyCommand} failed: STDERR:${stderr}\nSTDOUT:${stdout}`,
          ),
        );
      }

      const makeBabelJobProcess = childProcess.spawn(
        pathModule.join(__dirname, '..', '..', 'bin', 'makeBabelJob.js'),
        [
          '--babeldir',
          babelDir,
          '--root',
          tmpTestCaseCopyDir,
          '--i18n',
          pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
          pathModule.resolve(tmpTestCaseCopyDir, 'index.html'),
          '--locales',
          'en,cs',
        ],
      );

      const buffersByStreamName = {};
      const streamNames = ['stdout', 'stderr'];

      streamNames.forEach(function (streamName) {
        buffersByStreamName[streamName] = [];
        makeBabelJobProcess[streamName].on('data', function (chunk) {
          buffersByStreamName[streamName].push(chunk);
        });
      });

      function getStreamOutputText() {
        let outputText = '';
        streamNames.forEach(function (streamName) {
          if (buffersByStreamName[streamName].length > 0) {
            outputText += `\n${streamName.toUpperCase()}: ${Buffer.concat(
              buffersByStreamName[streamName],
            ).toString('utf-8')}\n`;
          }
        });
        return outputText;
      }

      makeBabelJobProcess.on('exit', function (exitCode) {
        if (exitCode) {
          return done(
            new Error(
              `The makeBabelJob process ended with a non-zero exit code: ${exitCode}${getStreamOutputText()}`,
            ),
          );
        }

        expect(fs.readdirSync(babelDir).sort(), 'to equal', []);
        done();
      });
    });
  });

  it('should extract all flattened keys for the default language when any language is missing at least one', function (done) {
    const babelDir = temp.mkdirSync();
    const tmpTestCaseCopyDir = temp.mkdirSync();

    const copyCommand = `cp '${pathModule.join(
      __dirname,
      '..',
      '..',
      'testdata',
      'bin',
    )}'/makeBabelJob/includeAllFlattened/* ${tmpTestCaseCopyDir}`;

    childProcess.exec(copyCommand, function (err, stdout, stderr) {
      if (err) {
        return done(
          new Error(
            `${copyCommand} failed: STDERR:${stderr}\nSTDOUT:${stdout}`,
          ),
        );
      }

      const makeBabelJobProcess = childProcess.spawn(
        pathModule.join(__dirname, '..', '..', 'bin', 'makeBabelJob.js'),
        [
          '--babeldir',
          babelDir,
          '--root',
          tmpTestCaseCopyDir,
          '--i18n',
          pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
          pathModule.resolve(tmpTestCaseCopyDir, 'index.html'),
          '--locales',
          'en,cs',
        ],
      );

      const buffersByStreamName = {};
      const streamNames = ['stdout', 'stderr'];

      streamNames.forEach(function (streamName) {
        buffersByStreamName[streamName] = [];
        makeBabelJobProcess[streamName].on('data', function (chunk) {
          buffersByStreamName[streamName].push(chunk);
        });
      });

      function getStreamOutputText() {
        let outputText = '';
        streamNames.forEach(function (streamName) {
          if (buffersByStreamName[streamName].length > 0) {
            outputText += `\n${streamName.toUpperCase()}: ${Buffer.concat(
              buffersByStreamName[streamName],
            ).toString('utf-8')}\n`;
          }
        });
        return outputText;
      }

      makeBabelJobProcess.on('exit', function (exitCode) {
        if (exitCode) {
          return done(
            new Error(
              `The makeBabelJob process ended with a non-zero exit code: ${exitCode}${getStreamOutputText()}`,
            ),
          );
        }

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'cs.txt'), 'utf-8'),
          'to equal',
          ['KeyPartiallyTranslatedToCzech[many]=', ''].join('\n'),
        );

        expect(fs.readdirSync(babelDir).sort(), 'to equal', [
          'cs.txt',
          'en.txt',
        ]);

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'en.txt'), 'utf-8'),
          'to equal',
          [
            'KeyPartiallyTranslatedToCzech[one]=the one',
            'KeyPartiallyTranslatedToCzech[other]=the other',
            '# NOTE: The language cs needs this additional key to cover all plural forms:',
            '# KeyPartiallyTranslatedToCzech[many]=',
            '',
          ].join('\n'),
        );

        expect(
          JSON.parse(
            fs.readFileSync(
              pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
              'utf-8',
            ),
          ),
          'to equal',
          {
            KeyPartiallyTranslatedToCzech: {
              en: { one: 'the one', other: 'the other' },
              cs: { one: 'xxxx', other: 'yyyy', few: 'zzzz', many: null },
            },
          },
        );
        done();
      });
    });
  });

  it('should discover language keys imported via System.js', function (done) {
    const babelDir = temp.mkdirSync();
    const tmpTestCaseCopyDir = temp.mkdirSync();

    const copyCommand = `cp '${pathModule.join(
      __dirname,
      '..',
      '..',
      'testdata',
      'bin',
    )}'/makeBabelJob/systemJs/* ${tmpTestCaseCopyDir}`;

    childProcess.exec(copyCommand, function (err, stdout, stderr) {
      if (err) {
        return done(
          new Error(
            `${copyCommand} failed: STDERR:${stderr}\nSTDOUT:${stdout}`,
          ),
        );
      }

      const makeBabelJobProcess = childProcess.spawn(
        pathModule.join(__dirname, '..', '..', 'bin', 'makeBabelJob.js'),
        [
          '--babeldir',
          babelDir,
          '--root',
          tmpTestCaseCopyDir,
          '--i18n',
          pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
          pathModule.resolve(tmpTestCaseCopyDir, 'index.html'),
          '--locales',
          'en,cs',
        ],
      );

      const buffersByStreamName = {};
      const streamNames = ['stdout', 'stderr'];

      streamNames.forEach(function (streamName) {
        buffersByStreamName[streamName] = [];
        makeBabelJobProcess[streamName].on('data', function (chunk) {
          buffersByStreamName[streamName].push(chunk);
        });
      });

      function getStreamOutputText() {
        let outputText = '';
        streamNames.forEach(function (streamName) {
          if (buffersByStreamName[streamName].length > 0) {
            outputText += `\n${streamName.toUpperCase()}: ${Buffer.concat(
              buffersByStreamName[streamName],
            ).toString('utf-8')}\n`;
          }
        });
        return outputText;
      }

      makeBabelJobProcess.on('exit', function (exitCode) {
        if (exitCode) {
          return done(
            new Error(
              `The makeBabelJob process ended with a non-zero exit code: ${exitCode}${getStreamOutputText()}`,
            ),
          );
        }

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'cs.txt'), 'utf-8'),
          'to equal',
          ['myAlert=', ''].join('\n'),
        );

        expect(fs.readdirSync(babelDir).sort(), 'to equal', [
          'cs.txt',
          'en.txt',
        ]);

        expect(
          fs.readFileSync(pathModule.resolve(babelDir, 'en.txt'), 'utf-8'),
          'to equal',
          ['myAlert=Hello', ''].join('\n'),
        );

        expect(
          JSON.parse(
            fs.readFileSync(
              pathModule.resolve(tmpTestCaseCopyDir, 'index.i18n'),
              'utf-8',
            ),
          ),
          'to equal',
          {
            myAlert: {
              en: 'Hello',
              cs: null,
            },
          },
        );
        done();
      });
    });
  });
});
