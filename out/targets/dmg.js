"use strict";

const deepAssign_1 = require("../util/deepAssign");
const path = require("path");
const log_1 = require("../util/log");
const platformPackager_1 = require("../platformPackager");
const bluebird_1 = require("bluebird");
const util_1 = require("../util/util");
//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter");
class DmgTarget extends platformPackager_1.Target {
    constructor(packager) {
        super("dmg");
        this.packager = packager;
        this.options = deepAssign_1.deepAssign({
            title: packager.appInfo.productName,
            "icon-size": 80,
            contents: [{
                "x": 410, "y": 220, "type": "link", "path": "/Applications"
            }, {
                "x": 130, "y": 220, "type": "file"
            }],
            format: packager.devMetadata.build.compression === "store" ? "UDRO" : "UDBZ"
        }, Object.assign({}, this.packager.devMetadata.build.osx, this.packager.devMetadata.build.dmg));
    }
    build(appOutDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const appInfo = this.packager.appInfo;
            const artifactPath = path.join(appOutDir, `${ appInfo.productFilename }-${ appInfo.version }.dmg`);
            yield new bluebird_1.Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                log_1.log("Creating DMG");
                const dmgOptions = {
                    target: artifactPath,
                    basepath: this.packager.projectDir,
                    specification: yield this.computeDmgOptions(appOutDir)
                };
                if (util_1.debug.enabled) {
                    util_1.debug(`appdmg: ${ JSON.stringify(dmgOptions, null, 2) }`);
                }
                const emitter = require("appdmg")(dmgOptions);
                emitter.on("error", reject);
                emitter.on("finish", () => resolve());
                if (util_1.debug.enabled) {
                    emitter.on("progress", info => {
                        if (info.type === "step-begin") {
                            util_1.debug(`appdmg: [${ info.current }] ${ info.title }`);
                        }
                    });
                }
            }));
            this.packager.dispatchArtifactCreated(artifactPath, `${ appInfo.name }-${ appInfo.version }.dmg`);
        });
    }
    // public to test
    computeDmgOptions(appOutDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const packager = this.packager;
            const specification = this.options;
            if (!("icon" in specification)) {
                util_1.use((yield packager.getIconPath()), it => {
                    specification.icon = it;
                });
            }
            if (!("background" in specification)) {
                const resourceList = yield packager.resourceList;
                if (resourceList.indexOf("background.png") !== -1) {
                    specification.background = path.join(packager.buildResourcesDir, "background.png");
                }
            }
            specification.contents[1].path = path.join(appOutDir, `${ packager.appInfo.productFilename }.app`);
            return specification;
        });
    }
}
exports.DmgTarget = DmgTarget;
//# sourceMappingURL=dmg.js.map