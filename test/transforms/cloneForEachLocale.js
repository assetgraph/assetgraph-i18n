/*global describe, it*/
const expect = require('../unexpected-with-plugins');

const _ = require('lodash');
const AssetGraph = require('assetgraph');

describe('cloneForEachLocale', function() {
  it('should make a clone of each Html file for each language', function(done) {
    new AssetGraph({
      root: __dirname + '/../../testdata/transforms/cloneForEachLocale/simple/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain asset', 'Html');
        expect(assetGraph, 'to contain asset', 'CacheManifest');
        expect(assetGraph, 'to contain asset', {
          type: 'JavaScript',
          isInline: true
        });
        expect(assetGraph, 'to contain asset', 'I18n');
        expect(assetGraph, 'to contain relation', 'HtmlStyle');
        expect(assetGraph, 'to contain asset', 'Css');
        expect(assetGraph, 'to contain relation', 'CssImage');
        expect(assetGraph, 'to contain asset', 'Png');
      })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', 'Html', 2);
        expect(assetGraph, 'to contain asset', 'CacheManifest');
        expect(
          assetGraph,
          'to contain relations',
          { type: 'HtmlStyle', to: { fileName: 'style.css' } },
          2
        );
        expect(assetGraph, 'to contain relation', 'CssImage');

        expect(
          assetGraph.findAssets({ fileName: 'index.en_us.html' })[0].text,
          'to match',
          /<html[^>]+lang=([\'\"])en_us\1/
        );
        expect(
          assetGraph.findAssets({ fileName: 'index.en_us.html' })[0].text,
          'to match',
          /var localizedString\s*=\s*([\'\"])The American English text\1/
        );
        expect(
          assetGraph.findAssets({ fileName: 'index.da.html' })[0].text,
          'to match',
          /var localizedString\s*=\s*([\'\"])The Danish text\1/
        );
      })
      .run(done);
  });

  it('should handle multiple locales', function() {
    return new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/multipleLocales/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', {}, 3);
        expect(assetGraph, 'to contain asset', 'Html');
        expect(
          assetGraph,
          'to contain assets',
          { type: 'JavaScript', isInline: true },
          1
        );
        expect(assetGraph, 'to contain relation', 'JavaScriptStaticUrl');
        expect(assetGraph, 'to contain asset', 'I18n');
      })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { isInitial: true },
          { localeIds: ['da', 'en_US', 'en_GB'] }
        )
      )
      .prettyPrintAssets({ type: 'JavaScript' })
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', 'Html', 3);
        expect(assetGraph, 'to contain assets', 'JavaScript', 3);

        let paragraphs = assetGraph
          .findAssets({ fileName: 'index.da.html' })[0]
          .parseTree.getElementsByTagName('p');
        expect(paragraphs[0].firstChild.nodeValue, 'to equal', 'Kropstekst');
        expect(
          paragraphs[1].innerHTML,
          'to equal',
          'En <span>beautiful</span> tekst med <span>lovely</span> pladsholdere i sig'
        );

        paragraphs = assetGraph
          .findAssets({ fileName: 'index.en_gb.html' })[0]
          .parseTree.getElementsByTagName('p');
        expect(
          paragraphs[0].firstChild.nodeValue,
          'to equal',
          'Some text in body'
        );
        expect(
          paragraphs[1].innerHTML,
          'to equal',
          'A <span>beautiful</span> text with oh so <span>lovely</span> placeholders in it'
        );

        paragraphs = assetGraph
          .findAssets({ fileName: 'index.en_us.html' })[0]
          .parseTree.getElementsByTagName('p');
        expect(
          paragraphs[0].firstChild.nodeValue,
          'to equal',
          'Some text in body'
        );
        expect(
          paragraphs[1].innerHTML,
          'to equal',
          'A <span>beautiful</span> text with <span>lovely</span> placeholders in it'
        );
      });
  });

  it('should handle a test case with an externalized inline HtmlStyle and inlineCssImagesWithLegacyFallback', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/inlineCssCombo/'
    })
      .loadAssets('index.html')
      .populate()
      .externalizeRelations({ type: 'HtmlStyle' })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .inlineCssImagesWithLegacyFallback({ type: 'Html' })
      .queue(function(assetGraph) {
        expect(
          assetGraph,
          'to contain assets',
          { type: 'Html', isInline: false },
          2
        );
        expect(assetGraph, 'to contain relation', {
          from: { fileName: 'index.en_us.html' },
          type: 'HtmlConditionalComment'
        });
        expect(assetGraph, 'to contain relation', {
          from: { fileName: 'index.da.html' },
          type: 'HtmlConditionalComment'
        });
      })
      .run(done);
  });

  it('should handle Knockout.js templates', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/knockoutTemplate/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', {}, 5);
        expect(assetGraph, 'to contain assets', 'Html', 3);
        expect(
          assetGraph,
          'to contain assets',
          { type: 'Html', isFragment: true },
          2
        );
        expect(assetGraph, 'to contain asset', 'JavaScript');
        expect(assetGraph, 'to contain asset', 'I18n');
      })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .queue(function(assetGraph) {
      expect(assetGraph, 'to contain assets', {}, 8);
      expect(assetGraph, 'to contain assets', 'Html', 5);
      expect(assetGraph, 'to contain assets', 'JavaScript', 2);
      expect(assetGraph, 'to contain asset', 'I18n');
      expect(
        assetGraph,
        'to contain assets',
        { type: 'Html', isFragment: true },
        3
      );

      let danishJavaScript = assetGraph.findRelations({
          type: 'HtmlScript',
          from: { fileName: 'index.da.html' }
        })[0].to;

      let americanEnglishJavaScript = assetGraph.findRelations({
        type: 'HtmlScript',
        from: { fileName: 'index.en_us.html' }
      })[0].to;

      expect(danishJavaScript, 'to be truthy');
      expect(americanEnglishJavaScript, 'to be truthy');
      expect(
        assetGraph.findRelations({ from: danishJavaScript })[0].to,
        'to equal',
        assetGraph.findRelations({ from: americanEnglishJavaScript })[0].to
      );

      danishJavaScript = assetGraph.findRelations({
        type: 'HtmlScript',
        from: { fileName: 'index.da.html' }
      })[0].to;
      expect(
        assetGraph.findRelations({
          from: danishJavaScript,
          type: 'JavaScriptStaticUrl'
        })[2].to.parseTree.firstChild.innerHTML,
        'to equal',
        '\n' +
          '    <div>Min sprognøgle</div>\n' +
          '    <span id="bar">Min anden sprognøgle</span>\n' +
          '    quux på dansk\n' +
          '    <span title="blah på dansk">baz på dansk</span>\n' +
          '    Her er en rar dyb i18n-struktur på dansk\n'
      );

      americanEnglishJavaScript = assetGraph.findRelations({
        type: 'HtmlScript',
        from: { fileName: 'index.en_us.html' }
      })[0].to;
      expect(
        assetGraph.findRelations({
          from: americanEnglishJavaScript,
          type: 'JavaScriptStaticUrl'
        })[2].to.parseTree.firstChild.innerHTML,
        'to equal',
        '\n' +
          '    <div>My language key</div>\n' +
          '    <span id="bar">My other language key</span>\n' +
          '    quux in English\n' +
          '    <span title="blah in English">baz in English</span>\n' +
          '    Here is a nice and English nested i18n construct in English\n'
      );
    })
      .run(done);
  });

  it('should handle a TR in a data-bind attribute', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/trInHtmlDataBindAttribute/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(
          assetGraph.findAssets({ fileName: 'index.da.html' })[0].text,
          'to match',
          /Den danske værdi/
        );
      })
      .run(done);
  });

  it('should handle a JavaScript asset that uses LOCALEID, DEFAULTLOCALE, LOCALECOOKIENAME, and SUPPORTEDLOCALEIDS', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/globalVarUsageInJavaScript/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          {
            localeIds: ['en_US', 'da'],
            defaultLocaleId: 'en_US',
            localeCookieName: 'myCookie'
          }
        )
      )
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', 'JavaScript', 2);

        const danishJavaScript = assetGraph.findAssets({
          type: 'JavaScript',
          incomingRelations: {
            $elemMatch: {
              type: 'HtmlScript',
              from: { fileName: 'index.da.html' }
            }
          }
        })[0];
        expect(
          danishJavaScript.text,
          'to equal',
          "alert('da');\n" +
            "alert('en_us');\n" +
            "alert('myCookie');\n" +
            'alert([\n' +
            "    'en_us',\n" +
            "    'da'\n" +
            ']);\n' +
            "LOCALEID = 'foo';    // Shouldn't be replaced\n"
        );
      })
      .run(done);
  });

  it('should handle a template in an inline script', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/inlineScriptTemplate/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', {}, 4);
        expect(assetGraph, 'to contain assets', 'Html', 2);
        expect(assetGraph, 'to contain asset', 'JavaScript');
        expect(assetGraph, 'to contain asset', 'I18n');
      })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html', isInline: false },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', {}, 7);
        expect(assetGraph, 'to contain assets', 'Html', 4);
        expect(assetGraph, 'to contain assets', 'JavaScript', 2);
        expect(assetGraph, 'to contain asset', 'I18n');
        expect(
          assetGraph.findAssets({ fileName: 'index.da.html' })[0].text,
          'to match',
          /Min sprognøgle/
        );
      })
      .run(done);
  });

  it('should handle a template in an inline script in a Knockout.js template', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/inlineScriptTemplateInKnockoutJsTemplate/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', {}, 5);
        expect(assetGraph, 'to contain assets', 'Html', 3);
        expect(
          assetGraph,
          'to contain assets',
          { type: 'Html', isFragment: true },
          2
        );
        expect(assetGraph, 'to contain asset', 'JavaScript');
        expect(assetGraph, 'to contain asset', 'I18n');
      })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html', isInline: false },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .queue(function(assetGraph) {
      expect(assetGraph, 'to contain assets', {}, 9);
      expect(assetGraph, 'to contain assets', 'Html', 6);
      expect(assetGraph, 'to contain assets', 'JavaScript', 2);
      expect(
        assetGraph,
        'to contain assets',
        { type: 'Html', isFragment: true },
        4
      );
      expect(assetGraph, 'to contain asset', 'I18n');

      const danishHtml = assetGraph.findAssets({
          fileName: 'index.da.html'
        })[0];

      const danishJavaScript = assetGraph.findRelations({
        from: danishHtml,
        type: 'HtmlScript'
      })[0].to;

      const danishKnockoutJsTemplate = assetGraph.findRelations({
        from: danishJavaScript,
        type: 'JavaScriptStaticUrl'
      })[0].to;

      expect(danishKnockoutJsTemplate.text, 'to match', /Min sprognøgle/);
    })
      .run(done);
  });

  it('should handle a Css asset that needs localization', function(done) {
    new AssetGraph({
      root: __dirname + '/../../testdata/transforms/cloneForEachLocale/css/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en', 'da', 'de', 'cs'] }
        )
      )
      .queue(function(assetGraph) {
      expect(assetGraph, 'to contain assets', { type: 'Css' }, 5);
      expect(assetGraph, 'to contain assets', { type: 'Png' }, 3);

      const danishCss = assetGraph.findAssets({
          fileName: 'needsLocalization.da.css'
        })[0];

      const cssRules = danishCss.parseTree.nodes;
      expect(cssRules, 'to have length', 3);
      expect(cssRules[0].selector, 'to equal', 'body');
      expect(cssRules[1].selector, 'to equal', 'html .theThing');
      let outgoingRelations = assetGraph.findRelations({ from: danishCss });
      expect(outgoingRelations, 'to have length', 1);
      expect(outgoingRelations[0].href, 'to equal', 'foo.png');

      const germanCss = assetGraph.findAssets({
        fileName: 'needsLocalization.de.css'
      })[0];
      expect(germanCss.parseTree.nodes, 'to have length', 3);
      expect(germanCss.parseTree.nodes[0].selector, 'to equal', 'body');
      expect(
        germanCss.parseTree.nodes[1].selector,
        'to equal',
        'html.anotherClassOnHtml .theGermanThing'
      );

      outgoingRelations = assetGraph.findRelations({ from: germanCss });
      expect(outgoingRelations, 'to have length', 1);
      expect(outgoingRelations[0].to, 'to have property', 'isImage', true);

      const englishCss = assetGraph.findAssets({
        fileName: 'needsLocalization.en.css'
      })[0];
      expect(englishCss.parseTree.nodes, 'to have length', 2);
      expect(englishCss.parseTree.nodes[0].selector, 'to equal', 'body');

      expect(englishCss.parseTree.nodes[1].selector, 'to equal', '.foobar');

      const czechCss = assetGraph.findAssets({
        fileName: 'needsLocalization.cs.css'
      })[0];
      expect(czechCss.parseTree.nodes, 'to have length', 2);
      expect(czechCss.parseTree.nodes[0].selector, 'to equal', 'body');

      expect(
        czechCss.parseTree.nodes[1].selector,
        'to equal',
        '.foobar, html .theCzechThing'
      );

      expect(assetGraph, 'to contain no relations', { from: englishCss });

      expect(assetGraph, 'to contain no relations', {
        to: { fileName: 'bar.png' }
      });

      expect(assetGraph, 'to contain relation', {
        from: { fileName: 'needsLocalization.de.css' },
        to: { isInline: true, isImage: true }
      });

      expect(assetGraph, 'to contain no relations', {
        from: { fileName: 'needsLocalization.da.css' },
        to: { isInline: true, isImage: true }
      });
    })
      .run(done);
  });

  it('should handle two Html assets that include references to the same JavaScripts', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/multipleHtmls/'
    })
      .loadAssets('1.html', '2.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(
          _.map(assetGraph.findAssets({ type: 'Html' }), 'url').sort(),
          'to equal',
          [
            assetGraph.root + '1.da.html',
            assetGraph.root + '1.en.html',
            assetGraph.root + '2.da.html',
            assetGraph.root + '2.en.html'
          ]
        );

        expect(
          _.map(assetGraph.findAssets({ type: 'JavaScript' }), 'url').sort(),
          'to equal',
          [
            assetGraph.root + 'doesNotNeedLocalization.da.js',
            assetGraph.root + 'doesNotNeedLocalization.en.js',
            assetGraph.root + 'needsLocalization.da.js',
            assetGraph.root + 'needsLocalization.en.js'
          ]
        );
      })
      .run(done);
  });

  it('should handle a language key that uses the same placeholder twice in the Danish translation', function() {
    return new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/reusePlaceHolder/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(
          assetGraph.findAssets({ fileName: 'index.da.html' })[0].parseTree.body
            .innerHTML,
          'to equal',
          "\n    <div>Some <span>foo</span> <span>foo</span> thing</div>\n    <script>\n        'index.i18n'.toString('url');\n    </script>\n\n\n"
        );
      });
  });

  it('should handle a language key that uses the same placeholder twice in the Danish translation when the placeholder in the Html has a relation in it', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/relationInPlaceHolder/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain relation', {
          type: 'HtmlImage',
          from: { fileName: 'index.en.html' }
        });
        expect(
          assetGraph,
          'to contain relations',
          { type: 'HtmlImage', from: { fileName: 'index.da.html' } },
          2
        );
      })
      .run(done);
  });

  it('should localize Svg assets', function(done) {
    new AssetGraph({
      root: __dirname + '/../../testdata/transforms/cloneForEachLocale/svg/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain asset', 'Svg');
      })
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en_US', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(assetGraph, 'to contain assets', 'Html', 2);
        expect(assetGraph, 'to contain assets', 'Svg', 2);
        expect(
          assetGraph.findRelations({
            type: 'HtmlImage',
            from: { fileName: 'index.da.html' }
          })[0].to.text,
          'to match',
          /Dansk nøgle/
        );
        expect(
          assetGraph.findRelations({
            type: 'HtmlImage',
            from: { fileName: 'index.en_us.html' }
          })[0].to.text,
          'to match',
          /English key/
        );
      })
      .run(done);
  });

  it('should handle a JavaScript asset that contains only LOCALECOOKIENAME', function(done) {
    new AssetGraph({
      root:
        __dirname +
        '/../../testdata/transforms/cloneForEachLocale/localeCookieName/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeCookieName: 'MyCookie', localeIds: ['en', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        // TODO: The presence of only LOCALECOOKIENAME/SUPPORTEDLOCALEIDS/DEFAULTLOCALEID don't really require the asset to be cloned as
        // they just need to be replaced to the same value in each locale.
        const numJavaScriptAssets = assetGraph.findAssets({
          type: 'JavaScript'
        }).length;
        expect(
          numJavaScriptAssets === 1 || numJavaScriptAssets === 2,
          'to be truthy'
        );
        assetGraph
          .findAssets({ type: 'JavaScript' })
          .forEach(function(javaScriptAsset) {
            expect(javaScriptAsset.text, 'to match', /MyCookie/);
          });
      })
      .run(done);
  });

  it('should preserve the hrefType of an asset being cloned', function() {
    return new AssetGraph({
      root:
        __dirname + '/../../testdata/transforms/cloneForEachLocale/hrefType/'
    })
      .loadAssets('index.html')
      .populate()
      .queue(
        require('../../lib/transforms/cloneForEachLocale')(
          { type: 'Html' },
          { localeIds: ['en_us', 'da'] }
        )
      )
      .queue(function(assetGraph) {
        expect(
          assetGraph.findAssets({ fileName: 'index.da.html' })[0].text,
          'to contain',
          '/style.da.css'
        ).and('to contain', '/script.da.js');

        expect(
          assetGraph.findAssets({ fileName: 'index.en_us.html' })[0].text,
          'to contain',
          '/style.en_us.css'
        ).and('to contain', '/script.en_us.js');
      });
  });

  describe('with keepSpans:false', function() {
    it('should remove a <span> that was translated and had no attributes other than data-i18n', function() {
      return new AssetGraph({
        root:
          __dirname +
          '/../../testdata/transforms/cloneForEachLocale/spanWithDataI18nAndNoOtherAttributes/'
      })
        .loadAssets('index.html')
        .populate()
        .queue(
          require('../../lib/transforms/cloneForEachLocale')(
            { type: 'Html' },
            { keepSpans: false, localeIds: ['en_US', 'da'] }
          )
        )
        .queue(function(assetGraph) {
          expect(
            assetGraph.findAssets({ fileName: 'templateWithI18n.da.ko' })[0]
              .text,
            'to contain',
            '<div>Min sprognøgle</div>'
          );
        });
    });

    it('should leave a <span> that was translated and had another attribute besides data-i18n', function() {
      return new AssetGraph({
        root:
          __dirname +
          '/../../testdata/transforms/cloneForEachLocale/spanWithDataI18nOtherAttribute/'
      })
        .loadAssets('index.html')
        .populate()
        .queue(
          require('../../lib/transforms/cloneForEachLocale')(
            { type: 'Html' },
            { keepSpans: false, localeIds: ['en_US', 'da'] }
          )
        )
        .queue(function(assetGraph) {
          expect(
            assetGraph.findAssets({ fileName: 'templateWithI18n.da.ko' })[0]
              .text,
            'to contain',
            '<div><span data-foo="bar">Min sprognøgle</span></div>'
          );
        });
    });

    it('should not remove a span with data-i18=""', function() {
      return new AssetGraph({
        root:
          __dirname +
          '/../../testdata/transforms/cloneForEachLocale/spanWithEmptyDataI18n/'
      })
        .loadAssets('index.html')
        .populate()
        .queue(
          require('../../lib/transforms/cloneForEachLocale')(
            { type: 'Html' },
            { keepSpans: false, localeIds: ['en_US', 'da'] }
          )
        )
        .queue(function(assetGraph) {
          expect(
            assetGraph.findAssets({ fileName: 'templateWithI18n.da.ko' })[0]
              .text,
            'to contain',
            '<span>bar</span>'
          );
        });
    });
  });

  describe('with keepSpans:true', function() {
    it('should leave a <span> that was translated and had no attributes other than data-i18n', function() {
      return new AssetGraph({
        root:
          __dirname +
          '/../../testdata/transforms/cloneForEachLocale/spanWithDataI18nAndNoOtherAttributes/'
      })
        .loadAssets('index.html')
        .populate()
        .queue(
          require('../../lib/transforms/cloneForEachLocale')(
            { type: 'Html' },
            { keepSpans: true, localeIds: ['en_US', 'da'] }
          )
        )
        .queue(function(assetGraph) {
          expect(
            assetGraph.findAssets({ fileName: 'templateWithI18n.da.ko' })[0]
              .text,
            'to contain',
            '<div><span>Min sprognøgle</span></div>'
          );
        });
    });
  });
});
