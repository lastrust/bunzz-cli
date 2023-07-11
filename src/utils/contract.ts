import path from 'path';
import fs from 'fs';

export function getRootContractName(projectPath: string): string {
  // Find the first .sol file
  const contractsPath = path.join(projectPath, 'contracts');
  if (!fs.existsSync(contractsPath)) {
    throw new Error(
      'No contracts folder found. Please run this command in the root of your project.'
    );
  }
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
