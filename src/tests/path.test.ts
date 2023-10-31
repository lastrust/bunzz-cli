import { fetchContractInfo, parseCode } from "../utils/gql";
import {
  cleanDirectories,
  createHardhatConfig,
  mkDirFromSources,
} from "../utils/path";
import * as path from "path";
import fs from "fs/promises"; // Import the promise-based version

interface Contract {
  chainId: string;
  contractAddress: string;
}

describe("Cloning", () => {
  let tempFolder: string;

  beforeAll(async () => {
    tempFolder = path.join(__dirname, "temp");
    await fs.rm(tempFolder, { recursive: true, force: true });
  });

  afterAll(async () => {
    // await fs.rm(tempFolder, { recursive: true, force: true });
  });

  const testProjectStructure = async ({
    chainId,
    contractAddress,
  }: Contract) => {
    const projectPath = path.join(tempFolder, contractAddress);
    const {
      code,
      contractName,
      optimizationUsed,
      runs,
      viaIR,
      solidityVersion,
    } = await fetchContractInfo({ env: "local" }, chainId, contractAddress);

    const { sources } = parseCode(code, contractName);

    mkDirFromSources(cleanDirectories(sources), projectPath);

    createHardhatConfig(
      projectPath,
      solidityVersion,
      {
        enabled: optimizationUsed,
        runs,
        viaIR,
      },
      true
    );

    const { execSync } = require("child_process");

    const compileOutput = execSync("hardhat compile", {
      cwd: projectPath,
      encoding: "utf8",
    });

    expect(compileOutput).toMatch(
      /Compiled \d+ Solidity file(s)? successfully/
    );
  };

  it("works for single file contract", async () => {
    const contract = {
      chainId: "1",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    };

    await testProjectStructure(contract);
  }, 10000);

  it("works with @ style libraries", async () => {
    const contract = {
      chainId: "1",
      contractAddress: "0x29469395eaf6f95920e59f858042f0e28d98a20b",
    };

    await testProjectStructure(contract);
  }, 10000);

  it("works with remapped imports", async () => {
    const contract = {
      chainId: "1",
      contractAddress: "0xe9bfe180c5696dd97db29791b1fa48ac833613ec",
    };

    await testProjectStructure(contract);
  }, 10000);
});
