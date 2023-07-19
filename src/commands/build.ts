import fs from 'fs';
import path from 'path';
import { execute } from '../utils/executer.js';

const PROD_BFF = 'https://bff.bunzz.dev/graphql';
const DEV_BFF = 'https://bff.dev.bunzz.dev/graphql';
const LOCAL_BFF = 'http://127.0.0.1:8081/graphql';

const PROD_FE = 'https://app.bunzz.dev';
const DEV_FE = 'https://app.dev.bunzz.dev';
const LOCAL_FE = 'http://localhost:3000';

const deleteCache = (projectPath: string) => {
  const cachePath = path.join(projectPath, 'cache');
  if (fs.existsSync(cachePath)) {
    fs.rmSync(cachePath, { recursive: true, force: true });
  }
  const artifactsPath = path.join(projectPath, 'artifacts');
  if (fs.existsSync(artifactsPath)) {
    fs.rmSync(artifactsPath, { recursive: true, force: true });
  }
};

const compile = async (projectPath: string): Promise<void> => {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  if (!fs.existsSync(hardhatConfigPath)) {
    throw new Error(
      'Hardhat is required to proceed. Please initiate a project using `bunzz clone`'
    );
  }

  try {
    await execute(`npx hardhat compile`, projectPath, {
      log: false,
      cwd: projectPath,
    });
  } catch (e: any) {
    const errorLines = e.message.split('\n').filter((line: string) => {
      return (
        !line.includes('--stack') ||
        !line.includes('--verbose') ||
        !line.includes('https')
      );
    });
    throw new Error(errorLines.join('\n'));
  }
};

const main = async (options: any) => {
  const projectPath = path.resolve(options.path || process.cwd());
  console.log(`Compiling all smart contracts at ${projectPath}`);

  try {
    deleteCache(projectPath);

    await compile(projectPath);
    console.log('Successfully compiled all smart contracts.');
  } catch (e: any) {
    console.error(e.message);
  }
};

export default main;
