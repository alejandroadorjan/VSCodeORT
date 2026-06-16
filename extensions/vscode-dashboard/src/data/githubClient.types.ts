/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface GitHubClientOptions {
	owner: string;
	repo: string;
	token?: string | null;
	fetchImpl?: GitHubFetchLike;
	perPage?: number;
	maxPages?: number;
}

export interface GitHubResponseLike {
	ok: boolean;
	status: number;
	statusText: string;
	json(): Promise<object>;
	text(): Promise<string>;
}

export type GitHubFetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<GitHubResponseLike>;
