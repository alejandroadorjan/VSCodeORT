/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { Repository } from './repository';

export class Bisect implements Disposable {

	private disposables: Disposable[];

	constructor() {
		this.disposables = [];
	}

	startBisect(repository: Repository): void {
		const repositoryPath: string = repository.root;
		console.log(repositoryPath);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
