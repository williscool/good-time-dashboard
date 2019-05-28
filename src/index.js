import commander from "commander";
import moment from "moment";
import to from "await-to-js";
import path from "path";
import fs from "fs-extra";
import util from "util";
import CachedEventbriteService, { DEFAULT_DAYS_AHEAD, TEST_NUMBER_OF_PAGES } from "./services/cached_eventbrite";
import EventFilterService from "./services/event_filter";

const DEFAULT_REPORT_NAME_PREFIX = "gti_output";

commander
  .description("Good Time Intel Tool Data Generator")
  .option("-c, --clear-cache", "clear the disk cache to get fresh event results")
  .option("-t, --test", `only processes 4 pages. defaults to false`);
// .option("-d, --days-ahead", `numbers of days ahead to look at. defaults to ${DEFAULT_DAYS_AHEAD}`);

commander.parse(process.argv);

/**
 * This is essentially an ETL job
 *
 * 1. we extract the events from eventbrite in cached_eventbrite service
 * 2. we filter the ones we want in filter_events then turn them into a csv
 * 3. so we can load into google sheets for further searching
 *
 */
async function init() {
  const cEbService = new CachedEventbriteService();

  const reportName = `${DEFAULT_REPORT_NAME_PREFIX}_${DEFAULT_DAYS_AHEAD}_days_from_${moment()
    .startOf("day")
    .format()}`;

  const rawReportName = `raw_${reportName}`;

  const outputPathObject = {
    dir: "tmp",
    name: rawReportName,
    ext: ".json"
  };

  const OUTPUT_FILE_PATH = path.format(outputPathObject);
  const outputFile = util.promisify(fs.outputFile);

  if (commander.clearCache) {
    console.log("Clearing cache before processing...");
    await cEbService.cache.clear();
    console.log("Cache Clear!");
  }

  const searchEventsOpts = { testMode: false };

  console.log("Beginning processing...");

  if (commander.test) {
    console.log(`Running in Test Mode. Only Processing ${TEST_NUMBER_OF_PAGES} pages of events`);
    searchEventsOpts.testMode = true;
  }

  const fullRawJSONOutputStr = await cEbService.searchEvents(searchEventsOpts);
  const [fileReadErr] = await to(outputFile(OUTPUT_FILE_PATH, fullRawJSONOutputStr));

  if (fileReadErr) {
    console.error(fileReadErr);
    process.exit(0);
  }

  console.log(`${OUTPUT_FILE_PATH} was saved!`);
  console.log("Processing Metrics: ", cEbService.generateMetrics());

  const rawOutput = JSON.parse(fullRawJSONOutputStr);
  // rawOutput.event_pages[0].events[0].description.text

  const filter = new EventFilterService(rawOutput);

  // eslint-disable-next-line no-unused-vars
  const events = filter.getDefaultSearches();

  // eslint-disable-next-line no-debugger
  debugger;
  // all we gotta do is turn the next bit into csv
}

init();
