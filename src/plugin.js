import { stripIndent } from 'common-tags';
import { outputFileSync } from 'fs-extra';
import camelCase from 'lodash/camelCase';
import get from 'lodash/get';
import kebabCase from 'lodash/kebabCase';
import { dirname, extname, basename, join, relative } from 'path';
import * as t from 'babel-types';
import template from 'babel-template';
import generate from 'babel-generator';

const buildImport = template('require(FILENAME);');
const buildComponent = template(
  `styled(TAGNAME, DISPLAYNAME, IMPORT, KEBABNAME, CAMELNAME)`,
);

const STYLES = Symbol('CSSLiteralLoader');

function getIdentifier(path) {
  const parent = path.findParent(p => p.isVariableDeclarator());
  return parent && t.isIdentifier(parent.node.id) ? parent.node.id.name : '';
}

function wrapInClass(className, value) {
  const imports = [];

  let match;
  const matcher = /@import.*?(?:$|;)/g;

  // eslint-disable-next-line no-cond-assign
  while ((match = matcher.exec(value))) {
    imports.push(match[0]);
  }

  value = value.replace(matcher, '');

  let val = `${className} {\n${value}\n}`;
  if (imports.length) val = `${imports.join('\n')}\n${val}`;
  return val;
}

function createFileName(hostFile, { extension = '.css' }, id) {
  const base = basename(hostFile, extname(hostFile));
  return join(dirname(hostFile), `${base}-${id}${extension}`);
}

function isTag(path, tagName, allowGlobal = false) {
  return (
    path.get('tag.name').node === tagName &&
    (path.get('tag').referencesImport('@maman/css-literal-loader/styled') ||
      (allowGlobal && path.scope.hasGlobal(tagName)))
  );
}

export default function plugin() {
  function evaluate(path) {
    const { confident, value } = path.evaluate();

    if (!confident) {
      throw path.buildCodeFrameError(
        'Could not evaluate css. Inline css must be statically analyzable',
      );
    }
    return value;
  }

  function createStyleNode(path, { opts, file }, identifier) {
    const { start, end } = path.node;
    const style = {
      start,
      end,
    };
    const getFileName = opts.getFileName || createFileName;

    const hostFile = file.opts.filename;
    style.path = getFileName(hostFile, opts, identifier);

    let filename = relative(dirname(hostFile), style.path);
    if (!filename.startsWith('.')) {
      filename = `./${filename}`;
    }
    style.filename = filename;
    style.identifier = identifier;

    return style;
  }

  function buildStyleRequire(path, state) {
    const { styles } = state.file.get(STYLES);
    const quasiPath = path.get('quasi');
    const style = createStyleNode(path, state, getIdentifier(path));
    style.value = evaluate(quasiPath);

    style.code = `require('${style.filename}')`;

    styles.add(style);
    return buildImport({
      FILENAME: t.StringLiteral(style.filename),
    }); // eslint-disable-line new-cap
  }

  function buildStyledComponent(path, state) {
    const cssState = state.file.get(STYLES);

    const tagName = get(path.get('tag'), 'node.arguments[0]');
    const displayName = getIdentifier(path) || tagName.value;

    const style = createStyleNode(path, state, displayName);
    style.tagName = t.isStringLiteral(tagName)
      ? `"${tagName.value}"`
      : tagName;

    const kebabName = kebabCase(displayName);
    style.value = wrapInClass(`.${kebabName}`, evaluate(path.get('quasi')));

    const runtimeNode = buildComponent({
      TAGNAME: tagName,
      DISPLAYNAME: t.StringLiteral(displayName),
      IMPORT: buildImport({
        FILENAME: t.StringLiteral(style.filename),
      }).expression,
      KEBABNAME: t.StringLiteral(kebabName),
      CAMELNAME: t.stringLiteral(camelCase(kebabName)),
    });

    if (state.opts.generateInterpolations)
      style.code = generate(runtimeNode).code;

    cssState.styles.add(style);
    return runtimeNode;
  }

  return {
    pre(file) {
      if (!file.has(STYLES)) {
        file.set(STYLES, {
          id: 0,
          styles: new Set(),
        });
      }
    },

    post(file) {
      const { opts } = this;

      let { styles } = file.get(STYLES);
      styles = Array.from(styles.values());

      file.metadata['@maman/css-literal-loader'] = {
        styles,
      };

      if (opts.writeFiles !== false) {
        styles.forEach(({ path, value }) => {
          outputFileSync(path, stripIndent([value]));
        });
      }
    },

    visitor: {
      TaggedTemplateExpression(path, state) {
        const { tagName = 'css', allowGlobal = true } = state.opts;
        const { node } = path;
        if (
          t.isCallExpression(node.tag) &&
          path
            .get('tag.callee')
            .referencesImport('@maman/css-literal-loader/styled')
        ) {
          path.replaceWith(buildStyledComponent(path, state));
          path.addComment('leading', '#__PURE__');
        } else if (isTag(path, tagName, allowGlobal)) {
          path.replaceWith(buildStyleRequire(path, state));
          path.addComment('leading', '#__PURE__');
        }
      },
    },
  };
}

module.exports = plugin;
