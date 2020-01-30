import Fuse from "fuse.js";
import { parse } from "json2csv";

const SEARCH_KEYS = ["name.text", "summary", "description.text"];
const CSV_COLUMNS_KEYS = [
  "id",
  "url",
  "address",
  "venueName",
  "name.text",
  "start.local",
  "summary",
  "description.text",
  "start.timezone"
];

class EventFilterService {
  constructor(rawOutput) {
    // rawOutput.event_pages[0].events[0].description.text

    const fuseOptions = {
      shouldSort: true,
      threshold: 0.3,
      location: 0,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: SEARCH_KEYS
    };

    let fullEventList = [];

    rawOutput.event_pages.forEach(page => {
      fullEventList = fullEventList.concat(page.events);
    });

    // fullEventList[0].description.text
    this.fuse = new Fuse(fullEventList, fuseOptions);
  }

  getDefaultSearches() {
    // "rap" = too broad
    const searches = ["r&b", "hip hop", "crawl", "RnB", "college night", "after party", "open bar", "happy hour"];

    let results = [];

    searches.forEach(query => {
      results = results.concat(this.fuse.search(query));
    });

    // TODO: we want to do some de dupe by id
    return results;
  }

  static generateCsvFromEventList(eventList) {
    const fields = CSV_COLUMNS_KEYS;
    const opts = { fields };
    let csv = "";

    try {
      csv = parse(eventList, opts);
    } catch (err) {
      console.error(err);
    }

    return csv;
  }
}

export default EventFilterService;
