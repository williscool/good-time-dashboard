import Fuse from "fuse.js";

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
      keys: ["name.text", "description.text", "summary"]
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
    const searches = ["r&b", "hip hop", "crawl"];

    let results = [];

    searches.forEach(query => {
      results = results.concat(this.fuse.search(query));
    });

    // TODO: we could do some de dupe by id
    return results;
  }
}

export default EventFilterService;
