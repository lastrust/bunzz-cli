import fs from 'fs';
import path from 'path';
import { Interface, createInterface } from 'readline';
import { execute } from '../utils/executer.js';

const main = async (options: any, rlInterface?: Interface | null) => {
  let projectPath = process.cwd();
  if (options.path) {
    projectPath = options.path;
  }

  const hardhatConfigPath = path.join(projectPath, 'hardhat.config.js');
  if (fs.existsSync(hardhatConfigPath)) {
    console.log('Hardhat is already initialized. Exiting.');
    return;
  }

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

  const rl =
    rlInterface ||
    createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  // Create the hardhat.config.js file
  // Ask for Solidity version
  rl.question(
    'What version of Solidity do you want to use? (if no option is provided, 0.8.0 will be used): ',
    (version) => {
      // Check with regex
      if (!version.match(/^(\d+\.)?(\d+\.)?(\*|\d+)$/)) {
        console.log(
          `${
            version !== '' ? 'Invalid version provided' : 'No version provided'
          }. Using 0.8.0`
        );
        version = '0.8.0';
      }

      // Create the hardhat.config.js file
      const configContent = `module.exports = {\n  solidity: "${version}",\n};\n`;
      fs.writeFileSync(hardhatConfigPath, configContent);
      console.log('Hardhat config file created.');

      rl.close();
    }
  );

  // Create contracts folder
  const contractsPath = path.join(projectPath, 'contracts');
  if (!fs.existsSync(contractsPath)) {
    fs.mkdirSync(contractsPath);
  }
};

export default main;
