import fs from 'fs';
import { gql, request } from 'graphql-request';
import open from 'open';
import path from 'path';
import { getRootContractName } from '../utils/contract.js';
import { execute } from '../utils/executer.js';

const PROD_BFF = 'https://bff.bunzz.dev/graphql';
const DEV_BFF = 'https://bff.dev.bunzz.dev/graphql';
const LOCAL_BFF = 'http://127.0.0.1:8081/graphql';

const PROD_FE = 'https://app.bunzz.dev';
const DEV_FE = 'https://app.dev.bunzz.dev';
const LOCAL_FE = 'http://localhost:3000';

const compile = async (projectPath: string): Promise<void> => {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  if (!fs.existsSync(hardhatConfigPath)) {
    throw new Error('Hardhat is required to proceed. Please run bunzz init.');
  }

  try {
    await execute(`npx hardhat compile`, projectPath, {
      log: false,
      cwd: projectPath,
    });
  } catch (e: any) {
    const errorLines = e.message.split('\n').filter((line: string) => {
      return !line.includes('--stack') || !line.includes('--verbose');
    });
    errorLines.forEach((errorLine: string) => {
      console.error(errorLine);
    });
  }
};

const getArtifacts = (
  projectPath: string,
  rootContractName: string
): {
  ABI: any;
  bytecode: string;
} => {
  const truncatedContractName = rootContractName
    .split('/')
    [rootContractName.split('/').length - 1].split('.')[0];

  // Find the compiled contract in the artifacts folder
  const contractPath = path.join(
    projectPath,
    'artifacts',
    'contracts',
    `${rootContractName}.sol`,
    `${truncatedContractName}.json`
  );

  try {
    // read the json file
    const contractJson = fs.readFileSync(contractPath, 'utf8');
    // parse the json
    const contract = JSON.parse(contractJson);
    const ABI = contract.abi;
    const bytecode = contract.bytecode;

    return { ABI, bytecode };
  } catch (e) {
    throw new Error(
      `Contract ${rootContractName} not found in artifacts folder. Exiting.`
    );
  }
};

const sendArtifacts = async (
  options: any,
  abi: any,
  bytecode: string
): Promise<string> => {
  const mutation = gql`
    mutation CreateArtifacts($req: CreateArtifactsReq!) {
      createArtifacts(req: $req) {
        id
      }
    }
  `;

  const variables = {
    req: {
      abi: JSON.stringify(abi),
      bytecode: bytecode,
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
    const response: any = await request(url, mutation, variables);

    return response.createArtifacts.id;
  } catch (error) {
    throw new Error('Failed to send artifacts to bunzz.dev');
  }
};

const openFrontend = async (options: any, id: string): Promise<void> => {
  let url;

  switch (options.env) {
    case 'dev':
      url = DEV_FE;
      break;
    case 'local':
      url = LOCAL_FE;
      break;
    default:
      url = PROD_FE;
      break;
  }

  const finalUrl = `${url}/deploy/${id}`;
  try {
    await open(finalUrl);
  } catch (e: any) {
    throw new Error(
      `Failed to open browser at ${finalUrl}, please open manually.`
    );
  }
};

const main = async (options: any) => {
  let projectPath = process.cwd();
  if (options.path) {
    projectPath = options.path;
  }

  console.log(`Deploying project at ${projectPath}`);

  try {
    await compile(projectPath);

    let rootContractName = options.contract;
    if (!rootContractName) {
      rootContractName = getRootContractName(projectPath);
      console.log(
        `No contract provided. Deploying ${rootContractName}.sol${
          options.env ? ` to ${options.env} environment` : ``
        }\n`
      );
    }

    const { ABI, bytecode } = getArtifacts(projectPath, rootContractName);
    const id = await sendArtifacts(options, ABI, bytecode);
    await openFrontend(options, id);
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
