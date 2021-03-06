"use strict";

const path = require("path");
const bluebird_1 = require("bluebird");
const fs_extra_p_1 = require("fs-extra-p");
const util_1 = require("../util/util");
const util_2 = require("../util/util");
const log_1 = require("../util/log");
const archiverUtil = require("archiver-utils");
const archiver = require("archiver");
//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter");
function convertVersion(version) {
    const parts = version.split("-");
    const mainVersion = parts.shift();
    if (parts.length > 0) {
        return [mainVersion, parts.join("-").replace(/\./g, "")].join("-");
    } else {
        return mainVersion;
    }
}
exports.convertVersion = convertVersion;
function syncReleases(outputDirectory, options) {
    log_1.log("Sync releases to build delta package");
    const args = prepareArgs(["-u", options.remoteReleases, "-r", outputDirectory], path.join(options.vendorPath, "SyncReleases.exe"));
    if (options.remoteToken) {
        args.push("-t", options.remoteToken);
    }
    return util_1.spawn(process.platform === "win32" ? path.join(options.vendorPath, "SyncReleases.exe") : "mono", args);
}
function buildInstaller(options, outputDirectory, setupExe, packager, appOutDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const appUpdate = yield packager.getTempFile("Update.exe");
        yield bluebird_1.Promise.all([fs_extra_p_1.copy(path.join(options.vendorPath, "Update.exe"), appUpdate).then(() => packager.sign(appUpdate)), bluebird_1.Promise.all([fs_extra_p_1.remove(`${ outputDirectory.replace(/\\/g, "/") }/*-full.nupkg`), fs_extra_p_1.remove(path.join(outputDirectory, "RELEASES"))]).then(() => fs_extra_p_1.ensureDir(outputDirectory))]);
        if (options.remoteReleases) {
            yield syncReleases(outputDirectory, options);
        }
        const embeddedArchiveFile = yield packager.getTempFile("setup.zip");
        const embeddedArchive = archiver("zip", { zlib: { level: options.packageCompressionLevel == null ? 6 : options.packageCompressionLevel } });
        const embeddedArchiveOut = fs_extra_p_1.createWriteStream(embeddedArchiveFile);
        const embeddedArchivePromise = new bluebird_1.Promise(function (resolve, reject) {
            embeddedArchive.on("error", reject);
            embeddedArchiveOut.on("close", resolve);
        });
        embeddedArchive.pipe(embeddedArchiveOut);
        embeddedArchive.file(appUpdate, { name: "Update.exe" });
        embeddedArchive.file(options.loadingGif ? path.resolve(options.loadingGif) : path.join(__dirname, "..", "..", "templates", "install-spinner.gif"), { name: "background.gif" });
        const version = convertVersion(options.version);
        const packageName = `${ options.name }-${ version }-full.nupkg`;
        const nupkgPath = path.join(outputDirectory, packageName);
        const setupPath = path.join(outputDirectory, setupExe || `${ options.name || options.productName }Setup.exe`);
        yield bluebird_1.Promise.all([pack(options, appOutDir, appUpdate, nupkgPath, version, options.packageCompressionLevel), fs_extra_p_1.copy(path.join(options.vendorPath, "Setup.exe"), setupPath)]);
        embeddedArchive.file(nupkgPath, { name: packageName });
        const releaseEntry = yield releasify(options, nupkgPath, outputDirectory, packageName);
        embeddedArchive.append(releaseEntry, { name: "RELEASES" });
        embeddedArchive.finalize();
        yield embeddedArchivePromise;
        const writeZipToSetup = path.join(options.vendorPath, "WriteZipToSetup.exe");
        yield util_1.exec(process.platform === "win32" ? writeZipToSetup : "wine", prepareArgs([setupPath, embeddedArchiveFile], writeZipToSetup));
        yield packager.signAndEditResources(setupPath);
        if (options.msi && process.platform === "win32") {
            const outFile = setupExe.replace(".exe", ".msi");
            yield msi(options, nupkgPath, setupPath, outputDirectory, outFile);
            // rcedit can only edit .exe resources
            yield packager.sign(path.join(outputDirectory, outFile));
        }
    });
}
exports.buildInstaller = buildInstaller;
function pack(options, directory, updateFile, outFile, version, packageCompressionLevel) {
    return __awaiter(this, void 0, void 0, function* () {
        const archive = archiver("zip", { zlib: { level: packageCompressionLevel == null ? 9 : packageCompressionLevel } });
        const archiveOut = fs_extra_p_1.createWriteStream(outFile);
        const archivePromise = new bluebird_1.Promise(function (resolve, reject) {
            archive.on("error", reject);
            archiveOut.on("error", reject);
            archiveOut.on("close", resolve);
        });
        archive.pipe(archiveOut);
        const author = options.authors || options.owners;
        const copyright = options.copyright || `Copyright © ${ new Date().getFullYear() } ${ author }`;
        const nuspecContent = `<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${ options.name }</id>
    <version>${ version }</version>
    <title>${ options.productName }</title>
    <authors>${ author }</authors>
    <owners>${ options.owners || options.authors }</owners>
    <iconUrl>${ options.iconUrl }</iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>${ options.description }</description>
    <copyright>${ copyright }</copyright>${ options.extraMetadataSpecs || "" }
  </metadata>
</package>`;
        util_2.debug(`Created NuSpec file:\n${ nuspecContent }`);
        archive.append(nuspecContent.replace(/\n/, "\r\n"), { name: `${ encodeURI(options.name).replace(/%5B/g, "[").replace(/%5D/g, "]") }.nuspec` });
        //noinspection SpellCheckingInspection
        archive.append(`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/${ options.name }.nuspec" Id="Re0" />
  <Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="/package/services/metadata/core-properties/1.psmdcp" Id="Re1" />
</Relationships>`.replace(/\n/, "\r\n"), { name: ".rels", prefix: "_rels" });
        //noinspection SpellCheckingInspection
        archive.append(`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="nuspec" ContentType="application/octet" />
  <Default Extension="pak" ContentType="application/octet" />
  <Default Extension="asar" ContentType="application/octet" />
  <Default Extension="bin" ContentType="application/octet" />
  <Default Extension="dll" ContentType="application/octet" />
  <Default Extension="exe" ContentType="application/octet" />
  <Default Extension="dat" ContentType="application/octet" />
  <Default Extension="psmdcp" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Override PartName="/lib/net45/LICENSE" ContentType="application/octet" />
  <Default Extension="diff" ContentType="application/octet" />
  <Default Extension="bsdiff" ContentType="application/octet" />
  <Default Extension="shasum" ContentType="text/plain" />
</Types>`.replace(/\n/, "\r\n"), { name: "[Content_Types].xml" });
        archive.append(`<?xml version="1.0" encoding="utf-8"?>
<coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
  <dc:creator>${ author }</dc:creator>
  <dc:description>${ options.description }</dc:description>
  <dc:identifier>${ options.name }</dc:identifier>
  <version>${ version }</version>
  <keywords/>
  <dc:title>${ options.productName }</dc:title>
  <lastModifiedBy>NuGet, Version=2.8.50926.602, Culture=neutral, PublicKeyToken=null;Microsoft Windows NT 6.2.9200.0;.NET Framework 4</lastModifiedBy>
</coreProperties>`.replace(/\n/, "\r\n"), { name: "1.psmdcp", prefix: "package/services/metadata/core-properties" });
        archive.file(updateFile, { name: "Update.exe", prefix: "lib/net45" });
        encodedZip(archive, directory, "lib/net45");
        yield archivePromise;
    });
}
function releasify(options, nupkgPath, outputDirectory, packageName) {
    return __awaiter(this, void 0, void 0, function* () {
        const args = ["--releasify", nupkgPath, "--releaseDir", outputDirectory];
        const out = (yield util_1.exec(process.platform === "win32" ? path.join(options.vendorPath, "Update.com") : "mono", prepareArgs(args, path.join(options.vendorPath, "Update-Mono.exe")), {
            maxBuffer: 4 * 1024000
        })).trim();
        if (util_2.debug.enabled) {
            util_2.debug(out);
        }
        const lines = out.split("\n");
        for (let i = lines.length - 1; i > -1; i--) {
            const line = lines[i];
            if (line.indexOf(packageName) !== -1) {
                return line.trim();
            }
        }
        throw new Error("Invalid output, cannot find last release entry");
    });
}
function msi(options, nupkgPath, setupPath, outputDirectory, outFile) {
    return __awaiter(this, void 0, void 0, function* () {
        const args = ["--createMsi", nupkgPath, "--bootstrapperExe", setupPath];
        yield util_1.exec(process.platform === "win32" ? path.join(options.vendorPath, "Update.com") : "mono", prepareArgs(args, path.join(options.vendorPath, "Update-Mono.exe")));
        //noinspection SpellCheckingInspection
        yield util_1.exec(path.join(options.vendorPath, "candle.exe"), ["-nologo", "-ext", "WixNetFxExtension", "-out", "Setup.wixobj", "Setup.wxs"], {
            cwd: outputDirectory
        });
        //noinspection SpellCheckingInspection
        yield util_1.exec(path.join(options.vendorPath, "light.exe"), ["-ext", "WixNetFxExtension", "-sval", "-out", outFile, "Setup.wixobj"], {
            cwd: outputDirectory
        });
        //noinspection SpellCheckingInspection
        yield bluebird_1.Promise.all([fs_extra_p_1.unlink(path.join(outputDirectory, "Setup.wxs")), fs_extra_p_1.unlink(path.join(outputDirectory, "Setup.wixobj")), fs_extra_p_1.unlink(path.join(outputDirectory, outFile.replace(".msi", ".wixpdb"))).catch(e => util_2.debug(e.toString()))]);
    });
}
function prepareArgs(args, exePath) {
    if (process.platform !== "win32") {
        args.unshift(exePath);
    }
    return args;
}
function encodedZip(archive, dir, prefix) {
    archiverUtil.walkdir(dir, function (error, files) {
        if (error) {
            archive.emit("error", error);
            return;
        }
        for (let file of files) {
            if (file.stats.isDirectory()) {
                continue;
            }
            // GBK file name encoding (or Non-English file name) caused a problem
            const entryData = {
                name: encodeURI(file.relative.replace(/\\/g, "/")).replace(/%5B/g, "[").replace(/%5D/g, "]"),
                prefix: prefix,
                stats: file.stats
            };
            archive._append(file.path, entryData);
        }
        archive.finalize();
    });
}
//# sourceMappingURL=squirrelPack.js.map