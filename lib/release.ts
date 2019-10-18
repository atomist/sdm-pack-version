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

import {
    GitProject,
    logger,
    ProjectOperationCredentials,
    RemoteRepoRef,
} from "@atomist/automation-client";
import {
    DefaultGoalNameGenerator,
    ExecuteGoal,
    ExecuteGoalResult,
    FulfillableGoal,
    FulfillableGoalDetails,
    getGoalDefinitionFrom,
    Goal,
    GoalInvocation,
    ImplementationRegistration,
    ProgressLog,
    PushTest,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { goalInvocationVersion } from "@atomist/sdm-core";
import { releaseLikeVersion } from "./semver";

/**
 * Arguments passed to a [[ReleaseCreator]].
 */
export interface ReleaseCreatorArguments {
    /** Project credentials. */
    credentials: ProjectOperationCredentials;
    /** SDM event triggering this goal. */
    goalEvent: SdmGoalEvent;
    /** Remote repository reference. */
    id: RemoteRepoRef;
    /** The version to create a release for. */
    releaseVersion: string;
    /** Progress log to write status updates to. */
    log: ProgressLog;
    /** Project to create release for. */
    project: GitProject;
}

/**
 * A function capable of creating a "release", whatever that means to
 * you.
 */
export type ReleaseCreator = (args: ReleaseCreatorArguments) => Promise<ExecuteGoalResult>;

/**
 * [[IncrementVersion]] fulfillment options.
 */
export interface ReleaseRegistration extends Partial<ImplementationRegistration> {
    /** Function capable of creating a release. */
    releaseCreator: ReleaseCreator;
}

/**
 * Class that abstracts creating a release for a project.
 */
export class Release extends FulfillableGoal {

    constructor(goalDetailsOrUniqueName: FulfillableGoalDetails | string = DefaultGoalNameGenerator.generateName("release"),
                ...dependsOn: Goal[]) {

        super({
            workingDescription: "Releasing",
            completedDescription: "Released",
            failedDescription: "Releasing failure",
            ...getGoalDefinitionFrom(goalDetailsOrUniqueName, DefaultGoalNameGenerator.generateName("release")),
            displayName: "release",
        }, ...dependsOn);
    }

    /**
     * Called by the SDM on initialization.  This function calls
     * `super.register` and adds a startup listener to the SDM.
     *
     * The startup listener registers a default, no-op goal fulfillment.
     */
    public register(sdm: SoftwareDeliveryMachine): void {
        super.register(sdm);

        sdm.addStartupListener(async () => {
            if (this.fulfillments.length === 0 && this.callbacks.length === 0) {
                this.with({
                    name: DefaultGoalNameGenerator.generateName("noop-release"),
                    releaseCreator: async () => ({ code: 0, message: "Release goal executed" }),
                });
            }
        });
    }

    /**
     * Add fulfillment to this goal.
     */
    public with(registration: ReleaseRegistration): this {
        super.addFulfillment({
            name: registration.name || DefaultGoalNameGenerator.generateName("release"),
            goalExecutor: executeRelease(registration.releaseCreator),
            pushTest: registration.pushTest,
        });
        return this;
    }

}

/**
 * Return an ExecuteGoal function that creates a release using the
 * provided releaseCreator function.  The function converts the
 * version associated with the goal set into a release-like semantic
 * version, see [[releaseLikeVersion]], before passing it to the
 * release creator function.
 *
 * @param releaseCreator Release creator function to use to create the release
 * @return Execute goal function
 */
export function executeRelease(releaseCreator: ReleaseCreator): ExecuteGoal {
    return async (gi: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { configuration, credentials, id, context, progressLog } = gi;
        if (!configuration.sdm.projectLoader) {
            const message = `Invalid configuration: no projectLoader`;
            logger.error(message);
            progressLog.write(message);
            return { code: 1, message };
        }

        return configuration.sdm.projectLoader.doWithProject({ credentials, id, context, readOnly: true }, async p => {
            const slug = `${p.id.owner}/${p.id.repo}`;
            const version = await goalInvocationVersion(gi);
            if (!version) {
                const msg = `Current goal set does not have a version`;
                logger.error(msg);
                progressLog.write(msg);
                return { code: 1, msg };
            }
            const releaseVersion = releaseLikeVersion(version, gi);
            progressLog.write(`Creating release ${releaseVersion} for ${slug}`);
            try {
                const releaseResult = await releaseCreator({
                    credentials,
                    goalEvent: gi.goalEvent,
                    id,
                    log: progressLog,
                    project: p,
                    releaseVersion,
                });
                if (releaseResult.code) {
                    throw new Error(releaseResult.message || "release creator failed");
                }
            } catch (e) {
                const msg = `Failed create release for ${slug}: ${e.message}`;
                logger.error(msg);
                progressLog.write(msg);
                return { code: 1, msg };
            }
            const message = `Created release ${releaseVersion} for ${slug}`;
            progressLog.write(message);
            return { code: 0, message };
        });
    };
}

/**
 * Push test detecting if the after commit of the push is related to a
 * release.
 */
export const IsReleaseCommit: PushTest = {
    name: "IsReleaseCommit",
    mapping: async pi => {
        const versionRegexp = /Version: increment after .* release/i;
        const changelogRegexp = /Changelog: add release .*/i;
        const commitMessage = (pi.push.after && pi.push.after.message) ? pi.push.after.message : "";
        return versionRegexp.test(commitMessage) || changelogRegexp.test(commitMessage);
    },
};
