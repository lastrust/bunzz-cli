import { fetchContractInfo, parseCode } from "../utils/gql";
import {
  cleanDirectories,
  createHardhatConfig,
  mkDirFromSources,
} from "../utils/path";
import * as path from "path";
import fs from "fs/promises"; // Import the promise-based version

describe("Cloning", () => {
  let tempFolder: string;

  beforeAll(() => {
    tempFolder = path.join(__dirname, "temp");
  });

  afterAll(async () => {
    await fs.rm(tempFolder, { recursive: true, force: true });
  });

  it("create proper project structure", async () => {
    const contracts = [
      {
        chainId: "1",
        contractAddress: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
      },
      {
        chainId: "1",
        contractAddress: "0x000000000022d473030f116ddee9f6b43ac78ba3",
      },
    ];

    await Promise.all(
      contracts.map(async ({ chainId, contractAddress }) => {
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
          /Compiled \d+ Solidity files successfully/
        );
      })
    );
  });
});
