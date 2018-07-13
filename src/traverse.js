import { transform } from 'babel-core';
import plugin from './plugin';

export default function traverse(source, filename, opts) {
  return transform(source, {
    filename,
    babelrc: false,
    code: false,
    ast: false,
    plugins: [[plugin, opts]],
    parserOpts: {
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowSuperOutsideMethod: true,
      sourceType: 'unambigious',
      sourceFilename: true,
      plugins: [
        'jsx',
        'flow',
        'objectRestSpread',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'asyncGenerators',
        'functionBind',
        'functionSent',
        'dynamicImport',
        'numericSeparator',
        'optionalChaining',
        'importMeta',
        'bigInt',
        'optionalCatchBinding',
        'throwExpressions',
        'nullishCoalescingOperator',
      ],
    },
  });
}
