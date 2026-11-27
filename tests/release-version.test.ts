import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { checkReleaseVersion } from "../scripts/check-release-version.mjs";

const manifest = { version: "0.1.3", minAppVersion: "1.5.0" };
const pkg = { version: "0.1.3" };
const versions = { "0.1.1": "1.5.0", "0.1.3": "1.5.0" };

describe("checkReleaseVersion", () => {
  it("accepts consistent metadata with and without a matching tag", () => {
    expect(checkReleaseVersion({ manifest, pkg, versions })).toEqual([]);
    expect(checkReleaseVersion({ manifest, pkg, versions, tag: "0.1.3" })).toEqual([]);
  });

  it("rejects a tag that differs from manifest.json version", () => {
    const errors = checkReleaseVersion({
      manifest: { version: "0.1.1", minAppVersion: "1.5.0" },
      pkg: { version: "0.1.1" },
      versions,
      tag: "0.1.2",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Tag "0.1.2"');
  });

  it("rejects a v-prefixed tag because Obsidian requires an exact match", () => {
    expect(checkReleaseVersion({ manifest, pkg, versions, tag: "v0.1.3" })).toHaveLength(1);
  });

  it("rejects package.json version drift", () => {
    const errors = checkReleaseVersion({ manifest, pkg: { version: "0.1.1" }, versions });
    expect(errors).toEqual([expect.stringContaining("package.json")]);
  });

  it("rejects a missing or mismatched versions.json entry", () => {
    expect(checkReleaseVersion({ manifest, pkg, versions: { "0.1.1": "1.5.0" } })).toEqual([
      expect.stringContaining("no entry"),
    ]);
    expect(checkReleaseVersion({ manifest, pkg, versions: { "0.1.3": "1.4.0" } })).toEqual([
      expect.stringContaining("minAppVersion"),
    ]);
  });

  it("rejects a manifest without version", () => {
    expect(checkReleaseVersion({ manifest: {}, pkg, versions })).toHaveLength(1);
  });

  it("passes for the repository metadata", () => {
    const root = path.resolve(__dirname, "..");
    const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
    expect(
      checkReleaseVersion({
        manifest: read("manifest.json"),
        pkg: read("package.json"),
        versions: read("versions.json"),
      })
    ).toEqual([]);
  });
});
