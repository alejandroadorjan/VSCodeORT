/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface GitHubRelease {
	tag_name?: string;
	published_at?: string | null;
	created_at?: string | null;
	draft?: boolean;
	prerelease?: boolean;
}
