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

import { InMemoryProject } from "@atomist/automation-client";
import * as assert from "power-assert";
import { GitHubReleaseCreator } from "../lib/github";
import * as octokit from "../lib/octokit";

describe("github", () => {

    describe("GitHubReleaseCreator", () => {

        let origCreateRelease: any;
        let createdRelease: boolean;
        async function fakeCreateRelease(r: octokit.ReleaseInfo): Promise<void> {
            createdRelease = true;
        }
        before(() => {
            origCreateRelease = Object.getOwnPropertyDescriptor(octokit, "createRelease");
        });
        after(() => {
            if (origCreateRelease) {
                Object.defineProperty(octokit, "createRelease", { value: origCreateRelease });
            }
        });
        beforeEach(() => {
            createdRelease = false;
            Object.defineProperty(octokit, "createRelease", { value: fakeCreateRelease });
        });

        it("successfully does nothing if not remote repo", async () => {
            const a: any = {
                credentials: { token: "XXX" },
                id: {
                    owner: "KendrickLamar",
                    repo: "DAMN.",
                },
                log: { write: () => { } },
                releaseVersion: "2.0.17",
            };
            const r = await GitHubReleaseCreator(a);
            assert(r.code === 0);
            assert(r.message === "Project KendrickLamar/DAMN. is neither a GitHub.com nor GHE remote repository");
            assert(!createdRelease, "created release but should not have");
        });

        it("successfully does nothing if not GitHub repo", async () => {
            const a: any = {
                credentials: { token: "XXX" },
                id: {
                    apiBase: "https://api.github.com",
                    kind: "bitbucketserver",
                    owner: "KendrickLamar",
                    repo: "DAMN.",
                    setUserConfig: async () => { },
                },
                log: { write: () => { } },
                releaseVersion: "2.0.17",
            };
            const r = await GitHubReleaseCreator(a);
            assert(r.code === 0);
            assert(r.message === "Project KendrickLamar/DAMN. is neither a GitHub.com nor GHE remote repository");
            assert(!createdRelease, "created release but should not have");
        });

        it("successfully does nothing if no token", async () => {
            const a: any = {
                credentials: {},
                id: {
                    apiBase: "https://api.github.com",
                    kind: "github",
                    owner: "KendrickLamar",
                    repo: "DAMN.",
                    setUserConfig: async () => { },
                },
                log: { write: () => { } },
                releaseVersion: "2.0.17",
            };
            const r = await GitHubReleaseCreator(a);
            assert(r.code === 0);
            assert(r.message === "Project KendrickLamar/DAMN. credentials are not TokenCredentials");
            assert(!createdRelease, "created release but should not have");
        });

        it("successfully creates release", async () => {
            const a: any = {
                credentials: { token: "XXX" },
                goalEvent: {
                    sha: "4455434b574f5254482e",
                },
                id: {
                    apiBase: "https://api.github.com",
                    kind: "github",
                    owner: "KendrickLamar",
                    repo: "DAMN.",
                    setUserConfig: async () => { },
                },
                log: { write: () => { } },
                project: InMemoryProject.of(),
                releaseVersion: "2.0.17",
            };
            async function fake(ri: octokit.ReleaseInfo): Promise<void> {
                createdRelease = true;
                assert(ri.auth === "XXX");
                assert(ri.baseUrl === "https://api.github.com");
                assert(ri.owner === "KendrickLamar");
                assert(ri.repo === "DAMN.");
                assert(ri.version === "2.0.17");
                assert(ri.sha === "4455434b574f5254482e");
                assert(ri.changelog === undefined);
            }
            Object.defineProperty(octokit, "createRelease", { value: fake });
            const r = await GitHubReleaseCreator(a);
            assert(r.code === 0);
            assert(r.message === "Created release 2.0.17 for KendrickLamar/DAMN.");
            assert(createdRelease, "failed to create release");
        });

        it("successfully creates release with changelog", async () => {
            const a: any = {
                credentials: { token: "XXX" },
                goalEvent: {
                    sha: "4455434b574f5254482e",
                },
                id: {
                    apiBase: "https://api.github.com",
                    kind: "github",
                    owner: "KendrickLamar",
                    repo: "DAMN.",
                    setUserConfig: async () => { },
                },
                log: { write: () => { } },
                project: InMemoryProject.of({ path: "CHANGELOG.md", content: "# Changelog\n" }),
                releaseVersion: "2.0.17",
            };
            async function fake(ri: octokit.ReleaseInfo): Promise<void> {
                createdRelease = true;
                assert(ri.auth === "XXX");
                assert(ri.baseUrl === "https://api.github.com");
                assert(ri.owner === "KendrickLamar");
                assert(ri.repo === "DAMN.");
                assert(ri.version === "2.0.17");
                assert(ri.sha === "4455434b574f5254482e");
                assert(ri.changelog === "CHANGELOG.md");
            }
            Object.defineProperty(octokit, "createRelease", { value: fake });
            const r = await GitHubReleaseCreator(a);
            assert(r.code === 0);
            assert(r.message === "Created release 2.0.17 for KendrickLamar/DAMN.");
            assert(createdRelease, "failed to create release");
        });

    });

});
