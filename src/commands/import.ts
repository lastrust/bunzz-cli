import * as fs from 'fs';
import { gql, request } from 'graphql-request';
import * as path from 'path';

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

const removeImportedSources = (
  sources: Record<FilePath, SourceInfo>
): Record<FilePath, SourceInfo> => {
  // Remove all sources that start with @
  const filteredSources: Record<FilePath, SourceInfo> = {};
  for (const filePath in sources) {
    if (!filePath.startsWith('@')) {
      filteredSources[filePath] = sources[filePath];
    }
  }

  return filteredSources;
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

const mkDirFromSources = (
  sources: Record<FilePath, SourceInfo>,
  projectPath: string
) => {
  // In case path is "."
  projectPath = path.resolve(projectPath);

  if (!projectPath.endsWith('/contracts')) {
    console.log(
      'The path you provided does not end with /contracts. Adding it.'
    );
    projectPath = path.join(projectPath, '/contracts');
  }

  for (const filePath in sources) {
    if (filePath.startsWith('@')) continue;
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
    const cleanedSources = cleanDirectories(removeImportedSources(sources));
    mkDirFromSources(cleanedSources, projectPath);
    console.log(`Done`);
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
