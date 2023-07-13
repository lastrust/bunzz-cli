import fs from 'fs';
import path from 'path';
import { Interface, createInterface } from 'readline';
import { execute } from '../utils/executer.js';
import { getRootContractVersion } from '../utils/contract.js';
import * as readlineSync from 'readline-sync';

const checkHardhatConfig = (projectPath: string) => {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  if (fs.existsSync(hardhatConfigPath)) {
    console.log('Hardhat is already initialized.');
    console.log('If you want to overwrite the config, please use --force.');
    console.log('Exiting.');
    return true;
  }
  return false;
};

const installHardhat = async (projectPath: string, installLatest: boolean) => {
  try {
    let packageJsonPath = path.join(projectPath, 'package.json');
    let hardhatVersion = '';

    // Check if package.json exists
    if (fs.existsSync(packageJsonPath) && !installLatest) {
      let packageJsonData = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf-8')
      );

      // Check for Hardhat in devDependencies and dependencies
      if (
        packageJsonData.devDependencies &&
        packageJsonData.devDependencies.hardhat
      ) {
        hardhatVersion = packageJsonData.devDependencies.hardhat;
      } else if (
        packageJsonData.dependencies &&
        packageJsonData.dependencies.hardhat
      ) {
        hardhatVersion = packageJsonData.dependencies.hardhat;
      }
    }

    console.log('Installing Hardhat...');
    await execute(
      `npm install --save-dev hardhat${
        hardhatVersion ? '@' + hardhatVersion : ''
      }`,
      projectPath,
      {
        log: false,
        cwd: projectPath,
      }
    );
    console.log('Hardhat successfully installed.');
  } catch (e) {
    console.error(e);
  }
};

const installOpenZeppelin = async (projectPath: string) => {
  try {
    let packageJsonPath = path.join(projectPath, 'package.json');
    let openZeppelinVersion = '';

    // Check if package.json exists
    if (fs.existsSync(packageJsonPath)) {
      let packageJsonData = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf-8')
      );

      // Check for @openzeppelin/contracts in devDependencies and dependencies
      if (
        packageJsonData.devDependencies &&
        packageJsonData.devDependencies['@openzeppelin/contracts']
      ) {
        openZeppelinVersion =
          packageJsonData.devDependencies['@openzeppelin/contracts'];
      } else if (
        packageJsonData.dependencies &&
        packageJsonData.dependencies['@openzeppelin/contracts']
      ) {
        openZeppelinVersion =
          packageJsonData.dependencies['@openzeppelin/contracts'];
      }
    }

    console.log('Installing OpenZeppelin...');
    await execute(
      `npm install --save-dev @openzeppelin/contracts${
        openZeppelinVersion ? '@' + openZeppelinVersion : ''
      }`,
      projectPath,
      {
        log: false,
        cwd: projectPath,
      }
    );
    console.log('OpenZeppelin successfully installed.');
  } catch (e) {
    console.error(e);
  }
};

const getReadlineInterface = (rlInterface?: Interface | null) => {
  return (
    rlInterface ||
    createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  );
};

const validateSolidityVersion = (
  version: string | null,
  rootContractVersion: string
) => {
  if (!version || !version.match(/^(\d+\.)?(\d+\.)?(\*|\d+)$/)) {
    console.log(
      `${
        version !== '' ? 'Invalid version provided' : 'No version provided'
      }. Using ${rootContractVersion}`
    );
    return rootContractVersion;
  }
  return version;
};

const writeConfig = (hardhatConfigPath: string, solidityVersion: string) => {
  const configContent = `module.exports = {\n  solidity: "${solidityVersion}",\n};\n`;
  fs.writeFileSync(hardhatConfigPath, configContent);
  console.log('Hardhat config file created.');
};

const createHardhatConfig = (
  rl: Interface,
  projectPath: string,
  solidityVersion: string | null
) => {
  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  // if solidityVersion is null, that means none was provided
  let rootContractVersion = '';
  try {
    rootContractVersion = getRootContractVersion(projectPath);
    console.log(
      `Found version of solidity files in /contracts folder as ${rootContractVersion}`
    );
  } catch {
    rootContractVersion = '0.8.0';
  }

  if (!solidityVersion) {
    const version = readlineSync.question(
      `What version of Solidity do you want to use? (if no option is provided, ${rootContractVersion} will be used): `
    );
    solidityVersion = version;
  }

  const finalVersion = validateSolidityVersion(
    solidityVersion,
    rootContractVersion
  );
  writeConfig(hardhatConfigPath, finalVersion);
};

const createContractsFolder = (projectPath: string) => {
  const contractsPath = path.join(projectPath, 'contracts');
  if (!fs.existsSync(contractsPath)) {
    fs.mkdirSync(contractsPath);
  }
};

const main = async (options: any, rlInterface?: Interface | null) => {
  const projectPath = options.path || process.cwd();
  const installLatestHardhat = !!options.installHardhat;
  const installLatestOpenZeppelin = !!options.installOpenzeppelin;
  const solidityVersion = options.solidityVersion || null;
  const force = options.force || false;

  if (!force && checkHardhatConfig(projectPath)) {
    return;
  }

  await installHardhat(projectPath, installLatestHardhat);

  if (installLatestOpenZeppelin) {
    await installOpenZeppelin(projectPath);
  }

  const rl = getReadlineInterface(rlInterface);

  createHardhatConfig(rl, projectPath, solidityVersion);

  createContractsFolder(projectPath);
};

export default main;
