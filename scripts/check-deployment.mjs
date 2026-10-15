import { checkDeploymentEnvironment } from './lib/deployment-config.mjs';
// Read process environment only; use Node --env-file for private local input.
const report = checkDeploymentEnvironment(process.env);
console.log(JSON.stringify(report, null, 2));
if (!report.configuration_ready) process.exitCode = 2;
