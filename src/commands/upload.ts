import fs from "fs";
import inquirer from "inquirer";
import jsonfile from "jsonfile";
import path from "path";
import vm from "vm";
import { sendArtifacts } from "../utils/gql.js";
import { checkContracts, compile, deleteCache } from "./build.js";
import { getArtifacts, openFrontend } from "./deploy.js";

interface SolidityFile {
  path: string;
  content: string;
}

interface Sandbox {
  module?: {
    exports: any;
  };
  require?: Function;
}

interface HardhatConfig {
  paths: {
    sources: string;
    artifacts: string;
  };
  solidity: any;
}

async function findSolidityFiles(dir: string): Promise<string[]> {
  let files: string[] = [];

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(await findSolidityFiles(fullPath));
    } else if (fullPath.endsWith(".sol")) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseImports(fileContent: string): string[] {
  const importRegex =
    /import\s+(["'])(.*?)\1;|import\s+\{[^}]*\}\s+from\s+(['"])(.*?)\3;/g;
  const imports = [];

  let match;
  while ((match = importRegex.exec(fileContent)) !== null) {
    imports.push(match[2] || match[4]);
  }

  return imports;
}

function fetchFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Error reading file ${filePath}: ${error}`);
  }
}

async function processSolidityFile(
  filePath: string,
  projectPath: string,
  processedFiles = new Set<string>()
): Promise<SolidityFile[]> {
  if (processedFiles.has(filePath)) return []; // Avoid cyclic imports
  processedFiles.add(filePath);

  const content = await fetchFileContent(filePath);
  const imports = parseImports(content);

  let files: SolidityFile[] = [{ path: filePath, content }];

  for (const importPath of imports) {
    // Skip third-party imported files
    if (importPath.startsWith("@")) {
      continue;
    }
    const resolvedPath = path.resolve(path.dirname(filePath), importPath);
    if (!resolvedPath.startsWith(projectPath)) {
      throw new Error(
        `Import outside of project directory is not allowed: ${importPath}`
      );
    }
    files = files.concat(
      await processSolidityFile(resolvedPath, projectPath, processedFiles)
    );
  }

  return files;
}

async function getAllSolidityFiles(
  sourcesPath: string,
  projectPath: string
): Promise<SolidityFile[]> {
  const resolvedSourcesPath = path.resolve(projectPath, sourcesPath);
  const sourceFiles = await findSolidityFiles(resolvedSourcesPath);
  let allFiles: SolidityFile[] = [];
  let processedFiles = new Set<string>();

  for (const file of sourceFiles) {
    // Check if file is already processed
    if (!processedFiles.has(file)) {
      const processed = await processSolidityFile(
        file,
        projectPath,
        processedFiles
      );
      allFiles = allFiles.concat(processed);
      processed.forEach((f) => processedFiles.add(f.path)); // Add to processed set
    }
  }

  return allFiles;
}

async function getRootContractRelatedSolFiles(
  sourcesPath: string,
  projectPath: string,
  rootContractName: string
): Promise<SolidityFile[]> {
  const resolvedSourcesPath = path.resolve(projectPath, sourcesPath);
  const sourceFiles = await findSolidityFiles(resolvedSourcesPath);
  let allFiles: SolidityFile[] = [];
  let processedFiles = new Set<string>();
  let rootContractFile = "";

  for (const filePath of sourceFiles) {
    const content = await fetchFileContent(filePath);
    const contractNames = await getContractNames(content);

    for (const contractName of contractNames) {
      if (rootContractName == contractName) {
        rootContractFile = filePath;
        break;
      }
    }
    if (!rootContractFile) break;
  }

  const processed = await processSolidityFile(
    rootContractFile,
    projectPath,
    processedFiles
  );
  allFiles = allFiles.concat(processed);
  processed.forEach((f) => processedFiles.add(f.path)); // Add to processed set

  const baseDirName = path.basename(projectPath);

  // Modify the file paths in allFiles
  allFiles = allFiles.map((file) => {
    const relativePath = path.relative(projectPath, file.path);
    return {
      ...file,
      path: path.join(baseDirName, relativePath),
    };
  });

  return allFiles;
}

async function getContractNames(content: string): Promise<string[]> {
  const contractNameRegex = /^\s*contract\s+(\w+)\s+/gm;
  let match;
  const contractNames: string[] = [];

  while ((match = contractNameRegex.exec(content)) !== null) {
    contractNames.push(match[1]);
  }

  return contractNames;
}

async function askUserToSelectContract(
  contractNames: string[]
): Promise<string> {
  const questions = [
    {
      type: "list",
      name: "selectedContract",
      message:
        "Please select the contract that you wanna use as the root contract during deployment:",
      choices: contractNames,
    },
  ];

  const answers = await inquirer.prompt(questions);
  return answers.selectedContract;
}

const getRootContractNameFromConfig = (projectPath: string): string => {
  // There is a bunzz.config.json file
  // Read contractName from it

  const bunzzConfigPath = path.join(projectPath, "bunzz.config.json");

  if (!fs.existsSync(bunzzConfigPath)) {
    return "";
  }

  const bunzzConfig = jsonfile.readFileSync(bunzzConfigPath);

  if (!bunzzConfig.contractName) {
    return "";
  }

  return bunzzConfig.contractName;
};

const readHardhatFile = async (
  projectPath: string
): Promise<{
  sourcesPath: string;
  artifactsPath: string;
  solidityVersion: string;
  optimizerEnabled: boolean;
  optimizerRuns: number;
}> => {
  const hardhatConfigPath = path.join(projectPath, "hardhat.config.js");

  if (!fs.existsSync(hardhatConfigPath)) {
    throw new Error(
      "The uploading process requires hardhat configuration file. Please run `bunzz init` to create it."
    );
  }

  const configFileContents = fs.readFileSync(hardhatConfigPath, "utf8");
  let hardhatConfig: HardhatConfig;

  try {
    // Evaluate the config file in a VM to safely obtain the exports
    const script = new vm.Script(configFileContents, {
      filename: "hardhat.config.js",
    });
    const sandbox: Sandbox = {
      module: { exports: {} },
      require: () => {}, // Stubbing require
    };
    const context = vm.createContext(sandbox);
    script.runInContext(context);

    if (!sandbox.module || typeof sandbox.module.exports === "undefined") {
      throw new Error("Failed to extract configuration from hardhat.config.js");
    }
    hardhatConfig = sandbox.module.exports;
  } catch (error) {
    throw new Error(`Error loading hardhat config: ${error}`);
  }

  // Extract required fields
  const sourcesPath = hardhatConfig.paths?.sources;
  const artifactsPath = hardhatConfig.paths?.artifacts;
  const solidity = hardhatConfig.solidity;

  let solidityVersion: string;
  let optimizerEnabled = false;
  let optimizerRuns = 0;

  if (typeof solidity === "string") {
    solidityVersion = solidity;
  } else {
    solidityVersion = solidity.version;
    optimizerEnabled = solidity.settings?.optimizer?.enabled;
    optimizerRuns = solidity.settings?.optimizer?.runs;
  }

  if (!sourcesPath || !artifactsPath || !solidityVersion) {
    throw new Error("Unable to find required fields in hardhat configuration.");
  }

  return {
    sourcesPath,
    artifactsPath,
    solidityVersion,
    optimizerEnabled,
    optimizerRuns,
  };
};

const main = async (options: any) => {
  const projectPath = path.resolve(options.path || process.cwd());

  console.log(`started the uploading process for ${projectPath} \n`);

  let rootContractName = options.contract;

  try {
    if (!rootContractName) {
      rootContractName = getRootContractNameFromConfig(projectPath);
    }

    const {
      sourcesPath,
      artifactsPath,
      solidityVersion,
      optimizerEnabled,
      optimizerRuns,
    } = await readHardhatFile(projectPath);

    // compile the contracts
    console.log("Compiling the contracts...\n");
    deleteCache(projectPath, artifactsPath);

    checkContracts(projectPath, sourcesPath);

    await compile(projectPath);

    // check if artifactsPath exists or not (if not means it's not compiled yet)
    if (!fs.existsSync(artifactsPath)) {
      throw new Error(
        `The project is not compiled yet, pls run \`bunzz build\` to compile it.`
      );
    }

    const allSolFiles = await getAllSolidityFiles(sourcesPath, projectPath);

    if (!rootContractName) {
      // get all the contracts from the artifactsPath
      let contractNames: string[] = [];
      for (const file of allSolFiles) {
        contractNames = contractNames.concat(
          await getContractNames(file.content)
        );
      }

      if (contractNames.length === 0) {
        throw new Error("No contracts found. Exiting...");
      }

      // ask user to select the base contract if the rootContractName is empty in interactive mode
      rootContractName = await askUserToSelectContract(contractNames);
      console.log(`Selected Contract: ${rootContractName}\n`);
    }

    // get rootContract related solidity files
    const solFiles = await getRootContractRelatedSolFiles(
      sourcesPath,
      projectPath,
      rootContractName
    );

    // get the artifacts of base contract
    const { ABI, bytecode } = getArtifacts(
      projectPath,
      rootContractName,
      artifactsPath
    );

    // validate the artifacts and respective code

    // store the artifacts and related infos to the bunzz server
    console.log(`sending artifacts to bunzz...\n`);

    const id = await sendArtifacts(
      options,
      ABI,
      bytecode,
      rootContractName,
      solidityVersion,
      optimizerEnabled,
      optimizerRuns,
      solFiles
    );
    await openFrontend(options, "repository/upload", id);
    console.log("Done");
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
