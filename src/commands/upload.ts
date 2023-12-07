import fs from "fs";
import jsonfile from "jsonfile";
import path from "path";
import { getArtifacts } from "./deploy.js";

interface SolidityFile {
  path: string;
  content: string;
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
  const importRegex = /^\s*import\s+(["'])(.*?)\1;/gm;
  const imports = [];

  let match;
  while ((match = importRegex.exec(fileContent)) !== null) {
    imports.push(match[2]);
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
  const sourceFiles = await findSolidityFiles(sourcesPath);
  let allFiles: SolidityFile[] = [];

  for (const file of sourceFiles) {
    allFiles = allFiles.concat(await processSolidityFile(file, projectPath));
  }

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
      message: "Please select a contract:",
      choices: contractNames,
    },
  ];

  const inquirer = (await import("inquirer")).default;
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
}> => {
  const hardhatConfigPath = path.join(projectPath, "hardhat.config.js");

  console.log(hardhatConfigPath);

  if (!fs.existsSync(hardhatConfigPath)) {
    throw new Error(
      "The uploading process requires hardhat configuration file. Please run `bunzz init` to create it. Detail: https://docs..."
    );
  }
  console.log("read the file");

  const hardhatConfig = await import(hardhatConfigPath);

  // Check if sources and artifacts path exists
  // And use default values if not

  console.log("~hardhatConfig", JSON.stringify(hardhatConfig, null, 2));

  console.log("read end");

  const sourcesPath = hardhatConfig.paths.sources;
  const artifactsPath = hardhatConfig.paths.artifacts;

  console.log("reading hardhat is done");
  return { sourcesPath, artifactsPath };
};

const main = async (options: any) => {
  const projectPath = path.resolve(options.path || process.cwd());

  console.log(`started the uploading process for ${projectPath}`);

  let rootContractName = options.contract;

  try {
    console.log("start the process");
    if (!rootContractName) {
      rootContractName = getRootContractNameFromConfig(projectPath);
    }

    console.log(`read the hardhat configuration file`);
    const { sourcesPath, artifactsPath } = await readHardhatFile(projectPath);

    // check if artifactsPath exists or not (if not means it's compiled yet)
    if (!fs.existsSync(artifactsPath)) {
      throw new Error(
        `The project is not compiled yet, pls run \`bunzz build\` to compile it.`
      );
    }

    // get the codes (solidity files absolute path and content which is in sourcePath or immported from the project dir others folders, except the third-party library ones)
    console.log(`get all solditity files`);
    const solFiles = await getAllSolidityFiles(sourcesPath, projectPath);

    if (!rootContractName) {
      // get all the contracts from the artifactsPath
      let contractNames: string[] = [];
      for (const file of solFiles) {
        contractNames = contractNames.concat(
          await getContractNames(file.content)
        );
      }

      if (contractNames.length === 0) {
        throw new Error("No contracts found.");
      }

      // ask user to select the base contract if the rootContractName is empty in interactive mode
      rootContractName = await askUserToSelectContract(contractNames);
      console.log(`Selected Contract: ${rootContractName}`);
    }

    // get the artifacts of base contract
    const { ABI, bytecode } = getArtifacts(projectPath, rootContractName);

    console.log("abi:", ABI);
    console.log("bytecode:", bytecode);

    // validate the artifacts and respective code

    console.log("Done");
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
