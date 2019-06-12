import commander from "commander";
import moment from "moment";
import to from "await-to-js";
import path from "path";
import fs from "fs-extra";
import util from "util";
import slugify from "slugify";
import CachedEventbriteService, { DEFAULT_DAYS_AHEAD, TEST_NUMBER_OF_PAGES } from "./services/cached_eventbrite";
import EventFilterService from "./services/event_filter";

const outputFile = util.promisify(fs.outputFile);

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
  // 1. Extract
  const cEbService = new CachedEventbriteService();

  const reportName = `${DEFAULT_REPORT_NAME_PREFIX}_${DEFAULT_DAYS_AHEAD}_days_from_${moment()
    .startOf("day")
    .format()}`;

  const rawReportName = `raw_${reportName}`;

  const rawJSONoutputPathObject = {
    dir: "tmp",
    name: rawReportName,
    ext: ".json"
  };

  const OUTPUT_FILE_PATH = path.format(rawJSONoutputPathObject);

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

  const metrics = cEbService.generateMetrics();

  console.log("Processing Metrics: ", metrics);

  const rawOutput = JSON.parse(fullRawJSONOutputStr);
  // rawOutput.event_pages[0].events[0].description.text

  // 2. Transform
  console.log("filtering events...");

  const filter = new EventFilterService(rawOutput);
  let events = filter.getDefaultSearches();

  // here also hit eventbrite on this small subset api to get address requires using venue id to request venue which has address
  console.log("adding addresses...");
  const eventsPromises = await events.map(async e => {
    const venue = await cEbService.getVenueByEventObject(e);

    const {
      name,
      // eslint-disable-next-line camelcase
      address: { localized_address_display }
    } = venue;

    return { ...e, address: localized_address_display, venueName: name };
  });

  // https://stackoverflow.com/questions/33438158/best-way-to-call-an-async-function-within-map
  events = await Promise.all(eventsPromises);

  // 3. Load

  const { fnInput } = metrics;

  const filteredKeys = ["testMode", "query"];

  const fileNamePostfix = Object.entries(fnInput)
    .filter(([k]) => !filteredKeys.includes(k))
    .map(([key, value]) => slugify(`${key} ${value}`))
    .join("_");

  // all we gotta do is turn the next bit into csv
  console.log(`generating then writting csv for ${events.length} events...`);
  const csvOutputPathObject = {
    dir: "tmp",
    name: `${reportName}_for_${fileNamePostfix}`,
    ext: ".csv"
  };

  const csvStr = EventFilterService.generateCsvFromEventList(events);

  const CSV_OUTPUT_FILE_PATH = path.format(csvOutputPathObject);

  const [csvfileReadErr] = await to(outputFile(CSV_OUTPUT_FILE_PATH, csvStr));

  if (csvfileReadErr) {
    console.error(csvfileReadErr);
    process.exit(0);
  }

  console.log(`${CSV_OUTPUT_FILE_PATH} was saved!`);
}

init();
