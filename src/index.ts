#!/usr/bin/env node

import { Command } from 'commander';
import deploy from './commands/deploy.js';
import init from './commands/init.js';

const program = new Command();

program.version('0.0.1').description('Bunzz CLI');

program
  .command('init')
  .description('Initialize a new Bunzz project')
  .option('--hardhat', 'Initialize a new Bunzz project with Hardhat')
  .action((options) => {
    program.opts = () => options;
  });

program
  .command('deploy')
  .description('Deploy contract through the Bunzz frontend')
  .option('-p, --path <path>', 'Path to the contract to deploy', '.')
  .option('-c, --contract <contract>', 'name of the contract to deploy')
  .option(
    '-e, --env <env>',
    'Environment to deploy to [prod, dev, local]',
    'prod'
  )
  .action((options) => {
    program.opts = () => options;
  });

program.parse(process.argv);

const options = program.opts();

switch (program.args[0]) {
  case 'init':
    init(options);
    break;
  case 'deploy':
    deploy(options);
    break;
}
