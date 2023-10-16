import * as fs from "fs";
import jsonfile from "jsonfile";
import * as path from "path";
import { initNpmRepository } from "../utils/executer.js";
import {
  fetchContractInfo,
  parseCode,
  sendCloningAnalytics,
} from "../utils/gql.js";
import { FilePath, SourceInfo } from "../utils/types/gql.js";
import {
  cleanDirectories,
  createHardhatConfig,
  mkDirFromSources,
} from "../utils/path.js";

const makeRootDirectory = (
  projectPath: string,
  directoryName: string
): void => {
  // Create the full path of the new directory
  const dirPath = path.join(projectPath, directoryName);

  // Check if the directory already exists
  if (!fs.existsSync(dirPath)) {
    // Create the directory
    fs.mkdirSync(dirPath, { recursive: true });
  } else {
    throw new Error(`Directory ${dirPath} already exists`);
  }
};

const createBunzzConfig = (projectPath: string, contractName: string) => {
  // Construct the config object
  const config = {
    contractName,
  };

  const bunzzConfigPath = path.join(projectPath, "bunzz.config.json");
  jsonfile.writeFileSync(bunzzConfigPath, config, { spaces: 2 });
};

const main = async (options: any) => {
  let projectPath = options.path || process.cwd();
  let directoryName = options.directory;
  let createdDirectory = false;

  try {
    if (directoryName) {
      makeRootDirectory(projectPath, directoryName);
      projectPath = path.join(projectPath, directoryName);
      createdDirectory = true;
    }

    const chainId = options.chain;
    const contractAddress = options.address;

    if (!chainId) {
      throw new Error("Missing chainId");
    }
    if (!contractAddress) {
      throw new Error("Missing contractAddress");
    }

    console.log(
      `Fetching contract information for ${contractAddress} from chain ${chainId}`
    );
    const {
      code,
      contractName,
      optimizationUsed,
      runs,
      viaIR,
      solidityVersion,
    } = await fetchContractInfo(options, chainId, contractAddress);

    if (!createdDirectory) {
      directoryName = directoryName || contractName;
      makeRootDirectory(projectPath, directoryName);
      projectPath = path.join(projectPath, directoryName);
    }

    console.log(`Importing code at ${projectPath}`);

    await initNpmRepository(projectPath);

    createHardhatConfig(projectPath, solidityVersion, {
      enabled: optimizationUsed,
      runs,
      viaIR,
    });

    console.log("Hardhat config file created.");

    createBunzzConfig(projectPath, contractName);

    console.log(`Parsing contract code`);
    const { sources } = parseCode(code, contractName);

    mkDirFromSources(cleanDirectories(sources), projectPath);

    console.log(
      `Created ${Object.keys(sources).length} file${
        Object.keys(sources).length > 1 ? "s" : ""
      }`
    );
    console.log(`Done`);

    sendCloningAnalytics(options, chainId, contractAddress, contractName);
  } catch (e: any) {
    console.error(e.message);

    if (directoryName === undefined) return;
    // If the error is not about the directory existing, delete the directory
    let re = /Directory .* already exists/;
    if (!re.test(e.message)) {
      console.log(`Deleting ${projectPath}`);
      fs.rmSync(projectPath, {
        recursive: true,
        force: true,
      });
    }
  }
};

export default main;
