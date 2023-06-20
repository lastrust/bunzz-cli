import fs from 'fs';
import path from 'path';
import { Interface } from 'readline';
import { execute } from '../utils/executer';
import { getRootContractName } from '../utils/contract';
import { request, gql } from 'graphql-request';

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
  let truncatedContractName: string[] | string;
  truncatedContractName = rootContractName.split('/');
  truncatedContractName =
    truncatedContractName[truncatedContractName.length - 1];
  truncatedContractName = truncatedContractName.split('.')[0];

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
    console.log('~path', contractPath);
    throw new Error(
      `Contract ${rootContractName} not found in artifacts folder. Exiting.`
    );
  }
};

const sendArtifacts = async (abi: any, bytecode: string): Promise<string> => {
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

  // PLACEHOLDER
  const url = 'https://bff.bunzz.dev/graphql';
  // const url = 'http://127.0.0.1:8081/graphql';

  try {
    // Send the request
    const response: any = await request(url, mutation, variables);

    // Assuming the mutation returns an object with an id property
    return response.storeArtifacts.id;
  } catch (error) {
    throw new Error('Failed to send artifacts to bunzz.dev');
  }
};

const openFrontend = async (id: string): Promise<void> => {
  // PLACEHOLDER
  const url = `https://bunzz.dev/deploy/${id}`;
  try {
    await execute(`open ${url}`, process.cwd(), {
      log: false,
      cwd: process.cwd(),
    });
  } catch (e: any) {
    throw new Error(`Failed to open browser at ${url}, please open manually.`);
  }
};

const main = async (options: any) => {
  let projectPath = process.cwd();
  if (options.path) {
    projectPath = options.path;
  } else {
    console.log('~options', options);
  }

  console.log(`Deploying project at ${projectPath}`);

  try {
    await compile(projectPath);

    let rootContractName = options.contract;
    if (!rootContractName) {
      rootContractName = getRootContractName(projectPath);
      console.log(`No contract provided. Deploying ${rootContractName}.sol`);
    }

    const { ABI, bytecode } = getArtifacts(projectPath, rootContractName);
    const id = await sendArtifacts(ABI, bytecode);
    await openFrontend(id);
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
