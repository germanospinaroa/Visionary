import process from "node:process";
import { runPilotSurvey } from "@/lib/pilot/worker";

const rawArgs = process.argv.slice(2);
const runIdArg = rawArgs.find((argument) => argument.startsWith("--runId="));
const runId = runIdArg ? runIdArg.slice("--runId=".length) : rawArgs[0];

if (!runId) {
  throw new Error("Missing runId argument.");
}

runPilotSurvey(runId)
  .then(() => {
    console.log(`Pilot run ${runId} completed.`);
  })
  .catch((error) => {
    console.error(`Pilot run ${runId} failed.`);
    console.error(error);
    process.exitCode = 1;
  });
