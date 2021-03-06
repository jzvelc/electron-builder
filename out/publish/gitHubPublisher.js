"use strict";

const util_1 = require("../util/util");
const log_1 = require("../util/log");
const util_2 = require("../util/util");
const path_1 = require("path");
const url_1 = require("url");
const mime = require("mime");
const fs_extra_p_1 = require("fs-extra-p");
const restApiRequest_1 = require("./restApiRequest");
const bluebird_1 = require("bluebird");
const uploader_1 = require("./uploader");
//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter");
class GitHubPublisher {
    constructor(owner, repo, version, options) {
        let isPublishOptionGuessed = arguments.length <= 4 || arguments[4] === undefined ? false : arguments[4];

        this.owner = owner;
        this.repo = repo;
        this.version = version;
        this.options = options;
        this.isPublishOptionGuessed = isPublishOptionGuessed;
        if (util_1.isEmptyOrSpaces(options.githubToken)) {
            throw new Error("GitHub Personal Access Token is not specified");
        }
        this.token = options.githubToken;
        this.policy = options.publish || "always";
        if (version.startsWith("v")) {
            throw new Error(`Version must not starts with "v": ${ version }`);
        }
        this.tag = `v${ version }`;
        this._releasePromise = this.token === "__test__" ? bluebird_1.Promise.resolve(null) : this.init();
    }
    get releasePromise() {
        return this._releasePromise;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            const createReleaseIfNotExists = this.policy !== "onTagOrDraft";
            // we don't use "Get a release by tag name" because "tag name" means existing git tag, but we draft release and don't create git tag
            const releases = yield restApiRequest_1.githubRequest(`/repos/${ this.owner }/${ this.repo }/releases`, this.token);
            for (let release of releases) {
                if (release.tag_name === this.tag) {
                    if (release.draft) {
                        return release;
                    }
                    if (!this.isPublishOptionGuessed && this.policy === "onTag") {
                        throw new Error(`Release with tag ${ this.tag } must be a draft`);
                    }
                    const message = `Release with tag ${ this.tag } is not a draft, artifacts will be not published`;
                    if (this.isPublishOptionGuessed || this.policy === "onTagOrDraft") {
                        log_1.log(message);
                    } else {
                        log_1.warn(message);
                    }
                    return null;
                } else if (release.tag_name === this.version) {
                    throw new Error(`Tag name must starts with "v": ${ release.tag_name }`);
                }
            }
            if (createReleaseIfNotExists) {
                log_1.log(`Release with tag ${ this.tag } doesn't exist, creating one`);
                return this.createRelease();
            } else {
                log_1.log(`Release with tag ${ this.tag } doesn't exist, artifacts will be not published`);
                return null;
            }
        });
    }
    upload(file, artifactName) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileName = artifactName || path_1.basename(file);
            const release = yield this.releasePromise;
            if (release == null) {
                util_2.debug(`Release with tag ${ this.tag } doesn't exist and is not created, artifact ${ fileName } is not published`);
                return;
            }
            const parsedUrl = url_1.parse(release.upload_url.substring(0, release.upload_url.indexOf("{")) + "?name=" + fileName);
            const fileStat = yield fs_extra_p_1.stat(file);
            let badGatewayCount = 0;
            uploadAttempt: for (let i = 0; i < 3; i++) {
                try {
                    return yield restApiRequest_1.doApiRequest({
                        hostname: parsedUrl.hostname,
                        path: parsedUrl.path,
                        method: "POST",
                        headers: {
                            Accept: "application/vnd.github.v3+json",
                            "User-Agent": "electron-builder",
                            "Content-Type": mime.lookup(fileName),
                            "Content-Length": fileStat.size
                        }
                    }, this.token, uploader_1.uploadFile.bind(this, file, fileStat, fileName));
                } catch (e) {
                    if (e instanceof restApiRequest_1.HttpError) {
                        if (e.response.statusCode === 422 && e.description != null && e.description.errors != null && e.description.errors[0].code === "already_exists") {
                            // delete old artifact and re-upload
                            log_1.log(`Artifact ${ fileName } already exists, overwrite one`);
                            const assets = yield restApiRequest_1.githubRequest(`/repos/${ this.owner }/${ this.repo }/releases/${ release.id }/assets`, this.token);
                            for (let asset of assets) {
                                if (asset.name === fileName) {
                                    yield restApiRequest_1.githubRequest(`/repos/${ this.owner }/${ this.repo }/releases/assets/${ asset.id }`, this.token, null, "DELETE");
                                    continue uploadAttempt;
                                }
                            }
                            log_1.log(`Artifact ${ fileName } not found, trying to upload again`);
                            continue;
                        } else if (e.response.statusCode === 502 && badGatewayCount++ < 3) {
                            continue;
                        }
                    }
                    throw e;
                }
            }
        });
    }
    createRelease() {
        return restApiRequest_1.githubRequest(`/repos/${ this.owner }/${ this.repo }/releases`, this.token, {
            tag_name: this.tag,
            name: this.version,
            draft: this.options.draft == null || this.options.draft,
            prerelease: this.options.prerelease != null && this.options.prerelease
        });
    }
    // test only
    //noinspection JSUnusedGlobalSymbols
    getRelease() {
        return __awaiter(this, void 0, void 0, function* () {
            return restApiRequest_1.githubRequest(`/repos/${ this.owner }/${ this.repo }/releases/${ this._releasePromise.value().id }`, this.token);
        });
    }
    //noinspection JSUnusedGlobalSymbols
    deleteRelease() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._releasePromise.isFulfilled()) {
                return;
            }
            const release = this._releasePromise.value();
            if (release == null) {
                return;
            }
            for (let i = 0; i < 3; i++) {
                try {
                    return yield restApiRequest_1.githubRequest(`/repos/${ this.owner }/${ this.repo }/releases/${ release.id }`, this.token, null, "DELETE");
                } catch (e) {
                    if (e instanceof restApiRequest_1.HttpError && (e.response.statusCode === 405 || e.response.statusCode === 502)) {
                        continue;
                    }
                    throw e;
                }
            }
            log_1.warn(`Cannot delete release ${ release.id }`);
        });
    }
}
exports.GitHubPublisher = GitHubPublisher;
//# sourceMappingURL=gitHubPublisher.js.map