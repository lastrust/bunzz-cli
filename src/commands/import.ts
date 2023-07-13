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
): Promise<{ code: string; contractName: string }> => {
  const query = gql`
    query FetchContractDoc($in: FetchContractDocInput!) {
      fetchContractDoc(in: $in) {
        document {
          contractName
          code
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

    const { code, contractName } = response.fetchContractDoc.document;
    return { code, contractName };
  } catch (error) {
    throw new Error('Failed to fetch contract from bunzz.dev');
  }
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
        [`${name}.sol`]: {
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

const cleanImportedSources = (
  sources: Record<FilePath, SourceInfo>
): Record<FilePath, SourceInfo> => {
  // Remove the @ from the beginning of the path
  const cleanedSources: Record<FilePath, SourceInfo> = {};
  for (const filePath in sources) {
    cleanedSources[filePath.slice(1)] = sources[filePath];
  }

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

  console.log(`Installing ${library}...`);
  await execute(`npm install --save-dev ${library}`, projectPath, {
    log: false,
    cwd: projectPath,
  });
  console.log(`${library} successfully installed.`);
};

const mkDirFromSources = (
  sources: Record<FilePath, SourceInfo>,
  projectPath: string,
  locallyImportedSources: string[]
) => {
  // In case path is "."
  projectPath = path.resolve(projectPath);

  if (!projectPath.endsWith('/contracts')) {
    projectPath = path.join(projectPath, '/contracts');
  }

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
    fs.writeFileSync(
      absolutePath,

      updateImportsInCode(
        filePath,
        sources[filePath].content,
        locallyImportedSources
      )
    );
    console.log(`Created ${filePath}`);
  }
};

const handleImportedSources = async (
  importedSources: Record<FilePath, SourceInfo>,
  projectPath: string
) => {
  const locallyImportedSourcesRecord = {} as Record<
    string,
    Record<FilePath, SourceInfo>
  >;
  console.log(`Importing ${Object.keys(importedSources).length} libraries`);
  let uniqueLibraries = getUniqueLibraries(importedSources);
  console.log(`Found ${Object.keys(uniqueLibraries).length} unique libraries`);

  if (Object.keys(uniqueLibraries).length > 1) {
    // First, ask if the user wants to import any of the imported sources
    const beginImport = readlineSync.question(
      'The provided contract uses imported files, would you like to import any of them? (y/n) '
    );

    if (beginImport !== 'y') {
      uniqueLibraries = {};
    }
  }

  for (const library in uniqueLibraries) {
    const { importMethod } = await inquirer.prompt([
      {
        type: 'list',
        name: 'importMethod',
        message: `How would you like to import ${library}?`,
        choices: ['Using npm', 'Locally', "Don't import"],
      },
    ]);

    switch (importMethod) {
      case 'Using npm':
        await importLibrary(library, projectPath);
        break;
      case 'Locally':
        if (!locallyImportedSourcesRecord[library]) {
          locallyImportedSourcesRecord[library] = {};
        }
        locallyImportedSourcesRecord[library] = cleanImportedSources(
          uniqueLibraries[library]
        );
        break;
      default:
        break;
    }
  }

  return locallyImportedSourcesRecord;
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
          lines[i] = line.replace(importPath, newPath);
        }
      }
    }
  }

  // Join the lines back into a single string
  return lines.join('\n');
};

const main = async (options: any) => {
  const projectPath = options.path || process.cwd();

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

  console.log(`Importing code at ${projectPath}`);

  try {
    console.log(
      `Fetching contract info for ${contractAddress} on chain ${chainId}`
    );
    const code = await fetchContractInfo(options, chainId, contractAddress);

    console.log(`Parsing contract code`);
    const { sources } = parseCode(code.code, code.contractName);
    let [regularSources, importedSources] = separateSources(sources);
    console.log(`Found ${Object.keys(regularSources).length} regular sources`);
    console.log(
      `Found ${Object.keys(importedSources).length} imported sources`
    );

    let locallyImportedSources = [] as string[];

    if (Object.keys(importedSources).length) {
      const locallyImportedSourcesRecord = await handleImportedSources(
        importedSources,
        projectPath
      );
      locallyImportedSources = Object.keys(locallyImportedSourcesRecord);

      // mkdir for each library
      for (const library in locallyImportedSourcesRecord) {
        console.log(`Creating directory for ${library}`);
        const librarySources = locallyImportedSourcesRecord[library];
        mkDirFromSources(librarySources, projectPath, locallyImportedSources);
      }
    }

    regularSources = cleanDirectories(regularSources);
    mkDirFromSources(regularSources, projectPath, locallyImportedSources);
    console.log(`Done`);
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
