import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const env = await readEnvLocal(path.join(projectRoot, ".env.local"));
const pluginDirectory = env.UTEMA_OBSIDIAN_PLUGIN_DIR?.trim();

if (!pluginDirectory) {
  throw new Error("UTEMA_OBSIDIAN_PLUGIN_DIR est manquant dans .env.local.");
}

const filesToDeploy = [
  "main.js",
  "styles.css",
  "manifest.json",
  "versions.json",
];

await mkdir(pluginDirectory, { recursive: true });

for (const fileName of filesToDeploy) {
  const sourcePath = path.join(projectRoot, fileName);
  const destinationPath = path.join(pluginDirectory, fileName);

  await ensureFileExists(sourcePath);
  await copyFile(sourcePath, destinationPath);
  console.log(`${fileName} -> ${destinationPath}`);
}

async function readEnvLocal(filePath) {
  const content = await readFile(filePath, "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    env[key] = unwrapEnvValue(rawValue);
  }

  return env;
}

function unwrapEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function ensureFileExists(filePath) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    throw new Error(`Fichier de build introuvable: ${filePath}`);
  }
}
