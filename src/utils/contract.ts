import path from 'path';
import fs from 'fs';

export function getRootContractName(projectPath: string): string {
  // Find the first .sol file
  const contractsPath = path.join(projectPath, 'contracts');
  const files = fs.readdirSync(contractsPath);
  const solFiles = files.filter((file: string) => {
    return file.endsWith('.sol');
  });
  if (solFiles.length === 0) {
    console.log('No .sol files found in contracts folder. Exiting.');
    process.exit(1);
  }
  return solFiles[0].replace('.sol', '');
}
