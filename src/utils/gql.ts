import { gql, request } from 'graphql-request';
import { ContractSourceCode } from './types/gql';

const PROD_BFF = 'https://bff.bunzz.dev/graphql';
const DEV_BFF = 'https://bff.dev.bunzz.dev/graphql';
const LOCAL_BFF = 'http://127.0.0.1:8081/graphql';

export const fetchContractInfo = async (
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

export const parseCode = (code: string, name: string): ContractSourceCode => {
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
