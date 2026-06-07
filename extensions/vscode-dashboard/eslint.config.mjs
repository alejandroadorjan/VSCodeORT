/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import typescriptEslint from 'typescript-eslint';

export default [{
	files: ['**/*.ts'],
}, {
	plugins: {
		'@typescript-eslint': typescriptEslint.plugin,
	},

	languageOptions: {
		parser: typescriptEslint.parser,
		ecmaVersion: 2022,
		sourceType: 'module',
	},

	rules: {
		'@typescript-eslint/naming-convention': ['warn', {
			selector: 'import',
			format: ['camelCase', 'PascalCase'],
		}],

		curly: 'warn',
		eqeqeq: 'warn',
		'no-throw-literal': 'warn',
		semi: 'warn',
	},
}];
