import { spawnSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { homedir, platform } from "os";
import path from "path";

const BUILD_FILES = ["main.js", "styles.css", "manifest.json"];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pluginId = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")).id;

function obsidianConfigPath() {
  const home = homedir();
  if (platform() === "darwin") {
    return path.join(home, "Library/Application Support/obsidian/obsidian.json");
  }
  if (platform() === "win32") {
    return path.join(process.env.APPDATA ?? path.join(home, "AppData/Roaming"), "obsidian/obsidian.json");
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "obsidian/obsidian.json");
}

function knownVaults() {
  const configPath = obsidianConfigPath();
  if (!existsSync(configPath)) return [];
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    return Object.values(config.vaults ?? {})
      .map((vault) => vault?.path)
      .filter((vaultPath) => typeof vaultPath === "string");
  } catch {
    return [];
  }
}

function resolveTargets() {
  const explicit = process.argv[2] ?? process.env.OBSIDIAN_PLUGIN_DIR;
  if (explicit) return [path.resolve(explicit)];

  const vaults = knownVaults();
  if (vaults.length === 0) {
    throw new Error(
      `No vault found in ${obsidianConfigPath()}.\n` +
        "Pass the plugin folder explicitly:\n" +
        "  node scripts/install-to-vault.mjs \"/path/to/Vault/.obsidian/plugins/" + pluginId + '"'
    );
  }
  return vaults.map((vault) => path.join(vault, ".obsidian", "plugins", pluginId));
}

function install(targetDir) {
  mkdirSync(targetDir, { recursive: true });

  for (const file of BUILD_FILES) {
    const source = path.join(root, file);
    if (!existsSync(source)) {
      throw new Error(`${file} is missing — run "npm run build" first.`);
    }
    copyFileSync(source, path.join(targetDir, file));
    console.log(`  ${file} (${statSync(source).size} bytes)`);
  }
}

/**
 * Folders like ~/Documents are off limits to terminals without Full Disk
 * Access, but Finder can always reach them — so hand the copy over to it.
 */
function installViaFinder(targetDir) {
  const lines = [
    `set destFolder to (POSIX file ${JSON.stringify(targetDir)} as alias)`,
    'tell application "Finder"',
    ...BUILD_FILES.map(
      (file) =>
        `  duplicate (POSIX file ${JSON.stringify(path.join(root, file))} as alias) to destFolder with replacing`
    ),
    "end tell",
  ];

  const result = spawnSync(
    "osascript",
    lines.flatMap((line) => ["-e", line]),
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || "osascript failed").trim());
  }

  for (const file of BUILD_FILES) {
    console.log(`  ${file} (${statSync(path.join(root, file)).size} bytes, via Finder)`);
  }
}

let installed = 0;
for (const targetDir of resolveTargets()) {
  console.log(`Installing ${pluginId} to ${targetDir}`);
  try {
    install(targetDir);
    installed++;
  } catch (error) {
    const isDenied = error.code === "EPERM" || error.code === "EACCES";
    if (isDenied && platform() === "darwin") {
      try {
        installViaFinder(targetDir);
        installed++;
        continue;
      } catch (finderError) {
        console.error(`  Finder could not copy either: ${finderError.message}`);
      }
    }
    if (isDenied) {
      console.error(
        `  refused by the OS: ${error.message}\n` +
          "  On macOS, folders like ~/Documents, ~/Desktop and ~/Downloads need\n" +
          "  Full Disk Access for the terminal running this command\n" +
          "  (System Settings -> Privacy & Security -> Full Disk Access)."
      );
      continue;
    }
    throw error;
  }
}

if (installed === 0) {
  process.exitCode = 1;
} else {
  console.log("Done — reload the plugin in Obsidian (Settings -> Community plugins -> Reload).");
}
