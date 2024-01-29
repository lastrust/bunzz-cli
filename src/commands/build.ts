import fs from "fs";
import path from "path";
import { execute } from "../utils/executer.js";

export const deleteCache = (projectPath: string, artifactsPath?: string) => {
  const cachePath = path.join(projectPath, "cache");
  if (fs.existsSync(cachePath)) {
    fs.rmSync(cachePath, { recursive: true, force: true });
  }
  const artifactsDir = path.resolve(
    projectPath,
    artifactsPath || "./artifacts"
  );
  if (fs.existsSync(artifactsDir)) {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
};

export const checkContracts = (projectPath: string, contractsPath?: string) => {
  const contractsDir = path.resolve(
    projectPath,
    contractsPath || "./contracts"
  );
  if (!fs.existsSync(contractsDir)) {
    throw new Error(
      "No contracts folder found. Please run this command in the root of your project."
    );
  }
};

const checkArtifacts = (projectPath: string) => {
  const artifactsPath = path.join(projectPath, "artifacts");

  let count = 0;

  const countJsonFiles = (dir: string) => {
    const files = fs.readdirSync(dir);

    for (let i = 0; i < files.length; i++) {
      const filename = path.join(dir, files[i]);
      const stat = fs.lstatSync(filename);

      if (stat.isDirectory()) {
        countJsonFiles(filename); // Recursive call for directories
      } else if (
        filename.endsWith(".json") &&
        !filename.endsWith(".dbg.json")
      ) {
        // Only count .json files in directories ending with .sol
        if (path.basename(path.dirname(filename)).endsWith(".sol")) {
          count++;
        }
      }
    }
  };

  countJsonFiles(artifactsPath);
  return count;
};

export const compile = async (projectPath: string): Promise<void> => {
  const hardhatConfigPath = path.join(projectPath, "hardhat.config.js");
  if (!fs.existsSync(hardhatConfigPath)) {
    throw new Error(
      "Hardhat is required to proceed. Please initiate a project using `bunzz clone`"
    );
  }

  try {
    await execute(`npx hardhat compile`, projectPath, {
      log: false,
      cwd: projectPath,
    });
  } catch (e: any) {
    const errorLines = e.message.split("\n").filter((line: string) => {
      return (
        !line.includes("--stack") ||
        !line.includes("--verbose") ||
        !line.includes("https")
      );
    });
    throw new Error(errorLines.join("\n"));
  }
};

const main = async (options: any) => {
  const projectPath = path.resolve(options.path || process.cwd());
  console.log(`Compiling all smart contracts at ${projectPath}`);

  try {
    deleteCache(projectPath);

    checkContracts(projectPath);

    await compile(projectPath);

    const compiledContracts = checkArtifacts(projectPath);

    console.log(
      `Compiled ${compiledContracts} contract${
        compiledContracts > 1 ? "s" : ""
      }.`
    );
    // Please run `bunzz deploy` to deploy this contract (after bunzz build)
    console.log(
      `Please run \`bunzz deploy\` or \`bunzz upload\` to deploy/upload this contract.`
    );
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
