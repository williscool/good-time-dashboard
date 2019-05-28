import commander from "commander";
import moment from "moment";
import to from "await-to-js";
import path from "path";
import fs from "fs-extra";
import util from "util";
import CachedEventbriteService, { DEFAULT_DAYS_AHEAD } from "./services/cached_eventbrite";

const DEFAULT_REPORT_NAME_PREFIX = "gti_output";

commander
  .description("Good Time Intel Tool Data Generator")
  .option("-c, --clear-cache", "clear the disk cache to get fresh event results")
  .option("-t, --test", `only processes 4 pages. defaults to false`);
// .option("-d, --days-ahead", `numbers of days ahead to look at. defaults to ${DEFAULT_DAYS_AHEAD}`);

commander.parse(process.argv);

async function writeJSON() {
  const cEbService = new CachedEventbriteService();

  const reportName = `${DEFAULT_REPORT_NAME_PREFIX}_${DEFAULT_DAYS_AHEAD}_days_from_${moment()
    .startOf("day")
    .format()}`;

  const outputPathObject = {
    dir: "tmp",
    name: reportName,
    ext: ".json"
  };

  const OUTPUT_FILE_PATH = path.format(outputPathObject);
  const outputFile = util.promisify(fs.outputFile);

  if (commander.clearCache) {
    console.log("Clearing cache before processing...");
    await cEbService.cache.clear();
    console.log("Cache Clear!");
  }

  const searchEventsOpts = {testMode: false};

  console.log("Beginning processing...");

  if (commander.test) {
    console.log('Running in Test Mode. Only Processing 4 events')
    searchEventsOpts.testMode = true;
  }

  const [fileReadErr] = await to(outputFile(OUTPUT_FILE_PATH, await cEbService.searchEvents(searchEventsOpts)));

  if (fileReadErr) {
    console.error(fileReadErr);
    process.exit(0);
  }

  console.log(`${OUTPUT_FILE_PATH} was saved!`);
  console.log("Processing Metrics: ", cEbService.generateMetrics());
}

writeJSON();
