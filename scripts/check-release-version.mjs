import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Obsidian reads `version` from manifest.json on the default branch and downloads the assets
 * of the GitHub release whose tag equals that version exactly (no "v" prefix).
 * Returns a list of problems; an empty list means the release metadata is consistent.
 *
 * @param {{ manifest: any, pkg: any, versions: any, tag?: string }} metadata
 * @returns {string[]}
 */
export function checkReleaseVersion({ manifest, pkg, versions, tag }) {
  const errors = [];
  const version = manifest?.version;

  if (!version) {
    return ["manifest.json has no \"version\" field."];
  }
  if (pkg?.version !== version) {
    errors.push(`package.json version "${pkg?.version}" does not match manifest.json version "${version}".`);
  }
  if (!versions || !(version in versions)) {
    errors.push(`versions.json has no entry for "${version}".`);
  } else if (versions[version] !== manifest.minAppVersion) {
    errors.push(
      `versions.json maps "${version}" to "${versions[version]}", but manifest.json minAppVersion is "${manifest.minAppVersion}".`
    );
  }
  if (tag !== undefined && tag !== version) {
    errors.push(`Tag "${tag}" does not match manifest.json version "${version}". Obsidian requires the tag to equal the version exactly.`);
  }

  return errors;
}

function readJson(root, file) {
  return JSON.parse(readFileSync(path.join(root, file), "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.argv[2] || undefined;
  const errors = checkReleaseVersion({
    manifest: readJson(root, "manifest.json"),
    pkg: readJson(root, "package.json"),
    versions: readJson(root, "versions.json"),
    tag,
  });

  if (errors.length > 0) {
    for (const error of errors) console.error(`::error::${error}`);
    process.exit(1);
  }
  console.log(`Release version ${tag ?? readJson(root, "manifest.json").version} is consistent.`);
}
