import * as fs from 'fs';
import { gql, request } from 'graphql-request';
import inquirer from 'inquirer';
import * as path from 'path';
import * as readlineSync from 'readline-sync';
import { execute } from '../utils/executer.js';

const PROD_BFF = 'https://bff.bunzz.dev/graphql';
const DEV_BFF = 'https://bff.dev.bunzz.dev/graphql';
const LOCAL_BFF = 'http://127.0.0.1:8081/graphql';

type FilePath = string & { __brand?: 'Path' };
type SourceInfo = { content: string };
interface ContractSourceCode {
  sources: Record<FilePath, SourceInfo>;
}

const fetchContractInfo = async (
  options: any,
  chainId: string,
  contractAddress: string
): Promise<{
  code: string;
  contractName: string;
  optimizationUsed: boolean;
  runs: number;
  solidityVersion: string;
}> => {
  const query = gql`
    query FetchContractDoc($in: FetchContractDocInput!) {
      fetchContractDoc(in: $in) {
        document {
          code
          contractName
          optimizationUsed
          runs
          solidityVersion
        }
      }
    }
  `;

  const variables = {
    in: {
      chainId,
      contractAddress,
    },
  };

  let url;

  switch (options.env) {
    case 'dev':
      url = DEV_BFF;
      break;
    case 'local':
      url = LOCAL_BFF;
      break;
    default:
      url = PROD_BFF;
      break;
  }

  try {
    const response: any = await request(url, query, variables);

    const { code, contractName, optimizationUsed, runs, solidityVersion } =
      response.fetchContractDoc.document;
    return { code, contractName, optimizationUsed, runs, solidityVersion };
  } catch (error) {
    console.error(error);
    throw new Error('Failed to fetch contract from bunzz.dev');
  }
};

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

const initNpmRepository = async (projectPath: string) => {
  // Initialize the npm repository
  try {
    console.log('Initializing npm repository...');
    await execute('npm init -y', projectPath, {
      log: false,
      cwd: projectPath,
    });
    console.log('npm repository successfully initialized.');

    await installHardhat(projectPath);
  } catch (e: any) {
    console.error(e.message);
  }
};

const installHardhat = async (projectPath: string) => {
  try {
    console.log('Installing Hardhat...');
    await execute(`npm install --save-dev hardhat`, projectPath, {
      log: false,
      cwd: projectPath,
    });
  } catch (e) {
    console.error(e);
  }

  console.log('Hardhat successfully installed.');
};

const createHardhatConfig = (
  projectPath: string,
  solidityVersion: string,
  optimizerSettings: {
    enabled: boolean;
    runs: number;
  }
) => {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');

  let optimizerContent = '';
  if (optimizerSettings.enabled) {
    optimizerContent = `\n  settings: {\n    optimizer: {\n      enabled: true,\n      runs: ${optimizerSettings.runs},\n    },\n  },`;
  }

  const cleanedVersion = solidityVersion.replace('v', '').split('+')[0];

  const configContent = `module.exports = {\n  solidity: "${cleanedVersion}",${optimizerContent}\n};\n`;

  fs.writeFileSync(hardhatConfigPath, configContent);
  console.log('Hardhat config file created.');
};

const parseCode = (code: string, name: string): ContractSourceCode => {
  const sourceHasSettings = code.startsWith('{{') && code.endsWith('}}');

  try {
    return JSON.parse(
      sourceHasSettings ? code.slice(1, -1) : code
    ) as ContractSourceCode;
  } catch (e) {
    return {
      sources: {
        [`contracts/${name}.sol`]: {
          content: code,
        },
      },
    };
  }
};

const separateSources = (
  sources: Record<FilePath, SourceInfo>
): Record<FilePath, SourceInfo>[] => {
  // Remove all sources that start with @
  const importedSources: Record<FilePath, SourceInfo> = {};
  const regularSources: Record<FilePath, SourceInfo> = {};
  for (const filePath in sources) {
    if (!filePath.startsWith('@')) {
      regularSources[filePath] = sources[filePath];
    } else {
      importedSources[filePath] = sources[filePath];
    }
  }

  return [regularSources, importedSources];
};

const cleanDirectories = (
  sources: Record<FilePath, SourceInfo>
): Record<FilePath, SourceInfo> => {
  let paths = Object.keys(sources);

  while (true) {
    const directories = paths.map((filePath) => filePath.split('/'));
    const firstSegment = directories[0][0];

    if (directories.every((dir) => dir[0] === firstSegment && dir.length > 1)) {
      // Remove the first segment from all paths
      paths = directories.map((dir) => path.join(...dir.slice(1)));
    } else {
      break;
    }
  }

  // Build the cleaned sources
  const cleanedSources: Record<FilePath, SourceInfo> = {};
  paths.forEach((filePath, index) => {
    cleanedSources[filePath] = sources[Object.keys(sources)[index]];
  });

  return cleanedSources;
};

const getUniqueLibraries = (
  sources: Record<FilePath, SourceInfo>
): Record<string, Record<FilePath, SourceInfo>> => {
  const libraries: Record<string, Record<FilePath, SourceInfo>> = {};

  for (const filePath in sources) {
    const source = sources[filePath];
    // The unique identifier of a library are the first two parts of a segment
    // For example: '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol'
    // The unique identifier is: '@uniswap/v3-core'

    const segments = filePath.split('/');
    const uniqueIdentifier = segments.slice(0, 2).join('/');
    if (!libraries[uniqueIdentifier]) {
      libraries[uniqueIdentifier] = {};
    }

    libraries[uniqueIdentifier][filePath] = source;
  }

  return libraries;
};

const importLibrary = async (library: string, projectPath: string) => {
  // install the library with npm
  try {
    console.log(`Installing ${library}... in ${projectPath}`);
    await execute(`npm install --save-dev ${library}`, projectPath, {
      log: false,
      cwd: projectPath,
    });
    console.log(`${library} successfully installed.`);
  } catch (e: any) {
    console.error(e.message);
  }
};

const mkDirFromSources = (
  sources: Record<FilePath, SourceInfo>,
  projectPath: string
) => {
  for (const filePath in sources) {
    // Convert the filePath to an absolute path
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

const updateImportsInCode = (
  filePath: string,
  code: string,
  locallyImportedSources: string[]
): string => {
  let lines = code.split('\n');

  let depth = filePath.split('/').length - 1;
  let importPrefix = depth === 0 ? './' : '../'.repeat(depth);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.includes('import "') || line.includes("import '")) {
      let importPath = line.split('import ')[1].replace(/['";]/g, '');

      if (importPath.startsWith('@')) {
        let firstTwoSegments = importPath.split('/').slice(0, 2).join('/');

        if (locallyImportedSources.includes(firstTwoSegments)) {
          let newPath = importPath.replace('@', importPrefix);
          // lines[i] = line.replace(importPath, newPath);
        }
      }
    }
  }

  // Join the lines back into a single string
  return lines.join('\n');
};

const main = async (options: any) => {
  let projectPath = options.path || process.cwd();
  let directoryName = options.directory;

  const chainId = options.chain;
  const contractAddress = options.address;

  if (!chainId) {
    console.error('Missing chainId');
    return;
  }
  if (!contractAddress) {
    console.error('Missing contractAddress');
    return;
  }

  try {
    console.log(
      `Fetching contract info for ${contractAddress} on chain ${chainId}`
    );
    const { code, contractName, optimizationUsed, runs, solidityVersion } =
      await fetchContractInfo(options, chainId, contractAddress);

    directoryName = directoryName || contractName;

    makeRootDirectory(projectPath, directoryName);
    projectPath = path.join(projectPath, directoryName);

    console.log(`Importing code at ${projectPath}`);

    await initNpmRepository(projectPath);

    createHardhatConfig(projectPath, solidityVersion, {
      enabled: optimizationUsed,
      runs,
    });

    console.log(`Parsing contract code`);
    const { sources } = parseCode(code, contractName);
    mkDirFromSources(sources, projectPath);

    console.log(`Done`);
  } catch (e: any) {
    console.error(e.message);

    // If the error is not about the directory existing, delete the directory
    if (
      !e.message.includes(
        `Directory ${path.join(projectPath, directoryName)} already exists`
      )
    ) {
      fs.rmSync(path.join(projectPath, directoryName), {
        recursive: true,
        force: true,
      });
    }
  }
};

export default main;
