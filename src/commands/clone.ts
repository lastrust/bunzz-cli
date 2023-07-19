import * as fs from 'fs';
import { gql, request } from 'graphql-request';
import inquirer from 'inquirer';
import * as path from 'path';
import * as readlineSync from 'readline-sync';
import { execute } from '../utils/executer.js';
import jsonfile from 'jsonfile';

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

    // await installHardhat(projectPath);
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

const createBunzzConfig = (
  projectPath: string,
  solidityVersion: string,
  optimizerSettings: {
    enabled: boolean;
    runs: number;
  },
  contractName: string
) => {
  // Construct the config object
  const config = {
    solidityVersion: solidityVersion.replace('v', '').split('+')[0],
    optimizerSettings,
    contractName,
  };

  const bunzzConfigPath = path.join(projectPath, 'bunzz.config.json');
  jsonfile.writeFileSync(bunzzConfigPath, config, { spaces: 2 });
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

const cleanDirectories = (
  sources: Record<FilePath, SourceInfo>
): Record<FilePath, SourceInfo> => {
  // Loop through sources and remove trailing '/' at the beginning
  for (const filePath in sources) {
    if (filePath.startsWith('/')) {
      sources[filePath.slice(1)] = sources[filePath];
      delete sources[filePath];
    }
  }

  let paths = Object.keys(sources);

  let segments: string[] = paths
    .filter((p) => !p.startsWith('@'))
    .map((p) => p.split('/')[0]);

  console.log('paths', paths);
  console.log('Segments', segments);

  let distinctSegments = [...new Set(segments)];

  let cleanedSources: Record<FilePath, SourceInfo> = {};

  if (distinctSegments.length === 1) {
    console.log('Distinct segments length is 1', distinctSegments);
    // Replace common starting segment with '/contracts'
    console.log('paths', paths);
    for (let p of paths) {
      if (!p.startsWith('@')) {
        cleanedSources[p.replace(distinctSegments[0], 'contracts')] =
          sources[p];
      } else {
        cleanedSources[p] = sources[p];
      }
    }
    console.log('paths', Object.keys(cleanedSources));
  } else {
    // Add '/contracts' to start of each path, ignoring ones that start with '@'
    for (let p of paths) {
      if (!p.startsWith('@')) {
        cleanedSources['contracts' + p] = sources[p];
      } else {
        cleanedSources[p] = sources[p];
      }
    }
  }

  return cleanedSources;
};

const mkDirFromSources = (
  sources: Record<FilePath, SourceInfo>,
  projectPath: string
) => {
  for (const filePath in sources) {
    // Convert the filePath to an absolute path
    // if filePath doesn't start with '@' or /contracts, add /contracts to the beginning
    const finalFilePath = filePath.startsWith('@')
      ? filePath
      : filePath.startsWith('contracts')
      ? filePath
      : `contracts/${filePath}`;
    const absolutePath = path.join(projectPath, finalFilePath);

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

const main = async (options: any) => {
  let projectPath = options.path || process.cwd();
  let directoryName = options.directory;
  let createdDirectory = false;

  if (directoryName) {
    makeRootDirectory(projectPath, directoryName);
    projectPath = path.join(projectPath, directoryName);
    createdDirectory = true;
  }

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
      `Fetching contract information for ${contractAddress} from chain ${chainId}`
    );
    const { code, contractName, optimizationUsed, runs, solidityVersion } =
      await fetchContractInfo(options, chainId, contractAddress);

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
    });

    createBunzzConfig(
      projectPath,
      solidityVersion,
      {
        enabled: optimizationUsed,
        runs,
      },
      contractName
    );

    console.log(`Parsing contract code`);
    const { sources } = parseCode(code, contractName);

    mkDirFromSources(cleanDirectories(sources), projectPath);

    console.log(`Created ${Object.keys(sources).length} files`);
    console.log(`Done`);
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
