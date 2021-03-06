"use strict";

const codeSign_1 = require("./codeSign");
const bluebird_1 = require("bluebird");
const platformPackager_1 = require("./platformPackager");
const metadata_1 = require("./metadata");
const path = require("path");
const log_1 = require("./util/log");
const util_1 = require("./util/util");
const fs_extra_p_1 = require("fs-extra-p");
const windowsCodeSign_1 = require("./windowsCodeSign");
const squirrelWindows_1 = require("./targets/squirrelWindows");
const nsis_1 = require("./targets/nsis");
const targetFactory_1 = require("./targets/targetFactory");
const fs_extra_p_2 = require("fs-extra-p");
//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter");
class WinPackager extends platformPackager_1.PlatformPackager {
    constructor(info) {
        super(info);
        const subjectName = this.platformSpecificBuildOptions.certificateSubjectName;
        if (subjectName == null) {
            const certificateFile = this.platformSpecificBuildOptions.certificateFile;
            const cscLink = this.options.cscLink;
            if (certificateFile != null) {
                const certificatePassword = this.platformSpecificBuildOptions.certificatePassword || this.getCscPassword();
                this.cscInfo = bluebird_1.Promise.resolve({
                    file: certificateFile,
                    password: certificatePassword == null ? null : certificatePassword.trim()
                });
            } else if (cscLink != null) {
                this.cscInfo = codeSign_1.downloadCertificate(cscLink, info.tempDirManager).then(path => {
                    return {
                        file: path,
                        password: this.getCscPassword()
                    };
                });
            } else {
                this.cscInfo = bluebird_1.Promise.resolve(null);
            }
        } else {
            this.cscInfo = bluebird_1.Promise.resolve({
                subjectName: subjectName
            });
        }
        this.iconPath = this.getValidIconPath();
    }
    createTargets(targets, mapper, cleanupTasks) {
        for (let name of targets) {
            if (name === targetFactory_1.DIR_TARGET) {
                continue;
            }
            if (name === targetFactory_1.DEFAULT_TARGET || name === "squirrel") {
                mapper("squirrel", () => {
                    const targetClass = require("./targets/squirrelWindows").default;
                    return new targetClass(this);
                });
            } else if (name === "nsis") {
                mapper(name, outDir => {
                    const targetClass = require("./targets/nsis").default;
                    return new targetClass(this, outDir);
                });
            } else {
                mapper(name, () => targetFactory_1.createCommonTarget(name));
            }
        }
    }
    get platform() {
        return metadata_1.Platform.WINDOWS;
    }
    getIconPath() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.iconPath;
        });
    }
    getValidIconPath() {
        return __awaiter(this, void 0, void 0, function* () {
            let iconPath = this.platformSpecificBuildOptions.icon || this.devMetadata.build.icon;
            if (iconPath != null && !iconPath.endsWith(".ico")) {
                iconPath += ".ico";
            }
            iconPath = iconPath == null ? yield this.getDefaultIcon("ico") : path.resolve(this.projectDir, iconPath);
            if (iconPath == null) {
                return null;
            }
            yield checkIcon(iconPath);
            return iconPath;
        });
    }
    pack(outDir, arch, targets, postAsyncTasks) {
        return __awaiter(this, void 0, void 0, function* () {
            const appOutDir = this.computeAppOutDir(outDir, arch);
            yield this.doPack((yield this.computePackOptions()), outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions);
            this.packageInDistributableFormat(outDir, appOutDir, arch, targets, postAsyncTasks);
        });
    }
    computeAppOutDir(outDir, arch) {
        return path.join(outDir, `win${ platformPackager_1.getArchSuffix(arch) }-unpacked`);
    }
    sign(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const cscInfo = yield this.cscInfo;
            if (cscInfo != null) {
                log_1.log(`Signing ${ path.basename(file) } (certificate file "${ cscInfo.file }")`);
                yield this.doSign({
                    path: file,
                    cert: cscInfo.file,
                    subjectName: cscInfo.subjectName,
                    password: cscInfo.password,
                    name: this.appInfo.productName,
                    site: yield this.appInfo.computePackageUrl(),
                    hash: this.platformSpecificBuildOptions.signingHashAlgorithms,
                    tr: this.platformSpecificBuildOptions.rfc3161TimeStampServer
                });
            }
        });
    }
    //noinspection JSMethodCanBeStatic
    doSign(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return windowsCodeSign_1.sign(options);
        });
    }
    signAndEditResources(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const appInfo = this.appInfo;
            const args = [file, "--set-version-string", "CompanyName", appInfo.companyName, "--set-version-string", "FileDescription", appInfo.description, "--set-version-string", "ProductName", appInfo.productName, "--set-version-string", "InternalName", path.basename(appInfo.productFilename, ".exe"), "--set-version-string", "LegalCopyright", appInfo.copyright, "--set-version-string", "OriginalFilename", "", "--set-file-version", appInfo.buildVersion, "--set-product-version", appInfo.version];
            util_1.use(this.platformSpecificBuildOptions.legalTrademarks, it => args.push("--set-version-string", "LegalTrademarks", it));
            util_1.use((yield this.getIconPath()), it => args.push("--set-icon", it));
            const rceditExecutable = path.join((yield windowsCodeSign_1.getSignVendorPath()), "rcedit.exe");
            const isWin = process.platform === "win32";
            if (!isWin) {
                args.unshift(rceditExecutable);
            }
            yield util_1.exec(isWin ? rceditExecutable : "wine", args);
            yield this.sign(file);
        });
    }
    postInitApp(appOutDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const executable = path.join(appOutDir, `${ this.appInfo.productFilename }.exe`);
            yield fs_extra_p_2.rename(path.join(appOutDir, "electron.exe"), executable);
            yield this.signAndEditResources(executable);
        });
    }
    packageInDistributableFormat(outDir, appOutDir, arch, targets, promises) {
        for (let target of targets) {
            if (target instanceof squirrelWindows_1.default) {
                promises.push(log_1.task(`Building Squirrel.Windows installer`, target.build(arch, appOutDir)));
            } else if (target instanceof nsis_1.default) {
                promises.push(target.build(arch, appOutDir));
            } else {
                const format = target.name;
                log_1.log(`Creating Windows ${ format }`);
                // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
                const outFile = path.join(outDir, this.generateName(format, arch, false, "win"));
                promises.push(this.archiveApp(format, appOutDir, outFile).then(() => this.dispatchArtifactCreated(outFile, this.generateName(format, arch, true, "win"))));
            }
        }
    }
}
exports.WinPackager = WinPackager;
function checkIcon(file) {
    return __awaiter(this, void 0, void 0, function* () {
        const fd = yield fs_extra_p_1.open(file, "r");
        const buffer = new Buffer(512);
        try {
            yield fs_extra_p_1.read(fd, buffer, 0, buffer.length, 0);
        } finally {
            yield fs_extra_p_1.close(fd);
        }
        if (!isIco(buffer)) {
            throw new Error(`Windows icon is not valid ico file, please fix "${ file }"`);
        }
        const sizes = parseIco(buffer);
        for (let size of sizes) {
            if (size.w >= 256 && size.h >= 256) {
                return;
            }
        }
        throw new Error(`Windows icon size must be at least 256x256, please fix "${ file }"`);
    });
}
function parseIco(buffer) {
    if (!isIco(buffer)) {
        throw new Error("buffer is not ico");
    }
    const n = buffer.readUInt16LE(4);
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
        result[i] = {
            w: buffer.readUInt8(6 + i * 16) || 256,
            h: buffer.readUInt8(7 + i * 16) || 256
        };
    }
    return result;
}
function isIco(buffer) {
    return buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1;
}
//# sourceMappingURL=winPackager.js.map