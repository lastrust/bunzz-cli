# Bunzz CLI

The Bunzz Command Line Interface (CLI) tool provides a streamlined method for developers to interact with the Bunzz platform. This guide outlines how to install and use the Bunzz CLI.

## Installation

Follow these instructions to set up the Bunzz CLI on your local machine for development and testing purposes.

**Prerequisites:** You will need to have Node.js and npm or yarn installed on your system. If you do not have these, you can download and install them from [Node.js](https://nodejs.org/) and [Yarn](https://yarnpkg.com/).

To install the Bunzz CLI:

1. Clone the repository to your local machine.
2. Navigate to the cloned repository.
3. Install the necessary dependencies using either npm or yarn:

   With npm:

   ```sh
   npm install
   ```

   With yarn:

   ```sh
   yarn install
   ```

4. Run the Bunzz CLI script:

   With npm:

   ```sh
   npm run dev-cli
   ```

   With yarn:

   ```sh
   yarn dev-cli
   ```

## Usage

The Bunzz CLI provides several commands that enable you to initialize, deploy, and import projects. Here is a summary of these commands:

- **bunzz -h:** Show help information and version details.

- **bunzz init [options]:** Initialize a new Bunzz project. The options you can use with this command include:

  - `-p, --path <path>`: Path to the project folder (default: ".")
  - `-h, --install-hardhat`: Install the latest version of Hardhat.
  - `-o, --install-openzeppelin`: Install the latest version of OpenZeppelin.
  - `-f, --force`: Force the creation of a new config file.
  - `-v, --solidity-version <version>`: Specify the version of Solidity to use.

- **bunzz deploy [options]:** Deploy contract through the Bunzz frontend. The options you can use with this command include:

  - `-p, --path <path>`: Path to the contract to deploy (default: ".")
  - `-c, --contract <contract>`: Name of the contract to deploy.
  - `-e, --env <env>`: Environment to deploy to [prod, dev, local] (default: "prod").

- **bunzz import [options]:** Import a contract from the Bunzz frontend. The options you can use with this command include:

  - `-c, --chain <chain>`: Chain to import from [1, 5, etc] (default: "1").
  - `-a, --address <address>`: Address of the contract to import.
  - `-e, --env <env>`: Environment to import from [prod, dev, local] (default: "prod").

To learn more about a specific command and its options, you can type `bunzz help [command]`.

## Example Commands

Here are some example commands:

- To get help on the `init` command:

  ```sh
  bunzz init -h
  ```

- To deploy a contract to the dev environment:

  ```sh
  bunzz deploy -c MyContract -p ./contracts/MyContract.sol -e dev
  ```

- To import a contract from the prod environment on chain 1:

  ```sh
  bunzz import -c 1 -a 0x123...abc -e prod
  ```
