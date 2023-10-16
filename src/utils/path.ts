import { FilePath, SourceInfo } from "./types/gql";
import * as path from "path";
import fs from "fs";

export const cleanDirectories = (
  sources: Record<FilePath, SourceInfo>
): Record<FilePath, SourceInfo> => {
  // Loop through sources and remove trailing '/' at the beginning
  for (const filePath in sources) {
    if (filePath.startsWith("/")) {
      sources[filePath.slice(1)] = sources[filePath];
      delete sources[filePath];
    }
  }

  const paths = Object.keys(sources);

  const segments: string[] = paths.map((p) => p.split("/")[0]);

  const distinctSegments = [
    ...new Set(segments.filter((segment) => !segment.startsWith("@"))),
  ];

  const cleanedSources: Record<FilePath, SourceInfo> = {};
  if (distinctSegments.length === 0) {
    for (let p of paths) {
      if (p.startsWith("@")) {
        cleanedSources[`contracts/${p}`] = sources[p];
      }
    }
  } else if (distinctSegments.length === 1) {
    // Replace common starting segment with '/contracts'
    for (let p of paths) {
      if (!p.startsWith("@")) {
        cleanedSources[p.replace(distinctSegments[0], "contracts")] =
          sources[p];
      } else {
        cleanedSources[p] = sources[p];
      }
    }
  } else {
    // Add '/contracts' to start of each path, ignoring ones that start with '@'
    const alreadyHasContracts = distinctSegments.some(
      (segment) => segment === "contracts"
    );
    for (let p of paths) {
      if (!p.startsWith("@") && !alreadyHasContracts) {
        cleanedSources[`contracts${!p.startsWith("/") ? "/" : ""}` + p] =
          sources[p];
      } else {
        cleanedSources[p] = sources[p];
      }
    }
  }

  return cleanedSources;
};

export const mkDirFromSources = (
  sources: Record<FilePath, SourceInfo>,
  projectPath: string
) => {
  for (const filePath in sources) {
    const absolutePath = path.join(projectPath, filePath);

    // Get the directory path
    const dirName = path.dirname(absolutePath);

    // Check if the directory exists, if not create it
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }

    // Write the content to a file
    fs.writeFileSync(absolutePath, sources[filePath].content);
  }
};

export const createHardhatConfig = (
  projectPath: string,
  solidityVersion: string,
  optimizerSettings: {
    enabled: boolean;
    runs: number;
    viaIR: boolean;
  },
  asCommonJS = false
) => {
  const hardhatConfigPath = path.join(
    projectPath,
    `hardhat.config.${asCommonJS ? "cjs" : "js"}`
  );

  const optimizerContent = optimizerSettings.enabled
    ? `optimizer: {\n      enabled: true,\n      runs: ${optimizerSettings.runs},\n    },\n    viaIR: ${optimizerSettings.viaIR},`
    : "";

  const cleanedVersion = solidityVersion.replace("v", "").split("+")[0];

  const configContent = `module.exports = {\n  solidity: {\n    version: "${cleanedVersion}",\n    settings: {\n      ${optimizerContent}\n    }\n  }\n};\n`;

  fs.writeFileSync(hardhatConfigPath, configContent);
};
