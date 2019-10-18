/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { logger } from "@atomist/automation-client";
import { isGitHubRepoRef } from "@atomist/automation-client/lib/operations/common/GitHubRepoRef";
import { isTokenCredentials } from "@atomist/automation-client/lib/operations/common/ProjectOperationCredentials";
import { createRelease } from "./octokit";
import { ReleaseCreator } from "./release";

/**
 * Create a GitHub release for GitHub.com or GHE projects.  If the
 * project is not a GitHub project or the project credentials do not
 * have a token, it issues are warning and returns success.
 */
export const GitHubReleaseCreator: ReleaseCreator = async args => {
    const slug = `${args.id.owner}/${args.id.repo}`;
    if (!isGitHubRepoRef(args.id)) {
        const message = `Project ${slug} is neither a GitHub.com nor GHE remote repository`;
        logger.warn(message);
        args.log.write(message);
        return { code: 0, message };
    }
    if (!isTokenCredentials(args.credentials)) {
        const message = `Project ${slug} credentials are not TokenCredentials`;
        logger.warn(message);
        args.log.write(message);
        return { code: 0, message };
    }

    try {
        let changelog: string | undefined;
        for (const ch of ["CHANGELOG.md", "CHANGELOG", "ChangeLog", "Changelog", "changelog"]) {
            if (await args.project.hasFile(ch)) {
                changelog = ch;
                break;
            }
        }
        await createRelease({
            auth: args.credentials.token,
            baseUrl: args.id.apiBase,
            owner: args.id.owner,
            repo: args.id.repo,
            version: args.releaseVersion,
            sha: args.goalEvent.sha,
            changelog,
        });
        const message = `Created release ${args.releaseVersion} for ${slug}`;
        args.log.write(message);
        return { code: 0, message };
    } catch (e) {
        const message = `Failed to create release ${args.releaseVersion} for project ${slug}: ${e.message}`;
        logger.warn(message);
        args.log.write(message);
        return { code: 1, message };
    }
};
