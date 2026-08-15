import { runCli } from "./cli";

void runCli().then((code) => {
  process.exit(code);
});
