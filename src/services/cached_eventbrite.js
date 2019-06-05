import AsyncDiskCache from "async-disk-cache";
import dotenv from "dotenv";
import eventbrite from "eventbrite";
import moment from "moment";
import querystring from "querystring";
import to from "await-to-js";
import ProgressBar from "progress";

dotenv.config();

const { EVENTBRITE_OAUTH_TOKEN, CENTER_POINT_ADDRESS, MILE_RADIUS_WITHIN, DAYS_AHEAD } = process.env;

export const TEST_NUMBER_OF_PAGES = 4;
export const DEFAULT_DAYS_AHEAD = 15;
const DEFAULT_CENTER_POINT_ADDRESS = "San Francisco,CA";
const DEFAULT_MILE_RADIUS_WITHIN = "25";

// https://www.eventbrite.com/platform/api#/introduction/basic-types/local-datetime
// NOTE: event brite wants a naive datetime
// that is one WITHOUT a timezone. that is why we have to format this way
// it uses the timezone of the event location to find stuff
const DATETIME_FORMAT_EVENTBRITE_WANTS = "YYYY-MM-DDThh:mm:ss";

class CachedEventbriteService {
  constructor() {
    this.cache = new AsyncDiskCache("eventbrite-api-request-cache", {
      location: "tmp/"
    });

    this.cacheObjects = [];

    this.metrics = { eventbrite: { totalPages: 0 } };
  }

  generateMetrics() {
    const hits = this.cacheObjects.filter(cacher => cacher.isCached).length;
    const misses = this.cacheObjects.filter(cacher => !cacher.isCached).length;

    return Object.assign(this.metrics, { cache: { hits, misses } });
  }

  static generateCacheKeyPrefix(params) {
    return Object.entries(params)
      .map(([key, value]) => `${key}:${value}`)
      .join(",");
  }

  static generatePageCacheKey(cacheKeyPrefix, page) {
    return `${cacheKeyPrefix}_page_number:${page}`;
  }

  async cachedSearchRequest(key, searchParams) {
    // Create configured Eventbrite SDK
    const sdk = eventbrite({ token: EVENTBRITE_OAUTH_TOKEN });

    const cacheEntry = await this.cache.get(key);
    this.cacheObjects.push(cacheEntry);

    let data = {};

    if (cacheEntry.isCached) {
      data = JSON.parse(cacheEntry.value);
    } else {
      let requestErr = {};

      [requestErr, data] = await to(
        sdk.request(`/events/search/?${querystring.unescape(querystring.stringify(searchParams))}`)
      );

      if (requestErr) {
        console.error(requestErr);
        process.exit(0);
      }

      await this.cache.set(key, JSON.stringify(data));
    }

    return data;
  }

  async searchEvents({
    query = "",
    mileRadiusWithin = MILE_RADIUS_WITHIN || DEFAULT_MILE_RADIUS_WITHIN,
    address = CENTER_POINT_ADDRESS || DEFAULT_CENTER_POINT_ADDRESS,
    daysAhead = DAYS_AHEAD || DEFAULT_DAYS_AHEAD,
    testMode = true
  } = {}) {
    this.metrics.fnInput = {
      query,
      mileRadiusWithin,
      address,
      daysAhead,
      testMode
    };

    const startDatetime = moment()
      .startOf("day")
      .format(DATETIME_FORMAT_EVENTBRITE_WANTS);

    const endDatetime = moment()
      .startOf("day")
      .add(daysAhead, "days")
      .format(DATETIME_FORMAT_EVENTBRITE_WANTS);

    // See: https://www.eventbrite.com/platform/api#/reference/event-search/search-events

    // MAKE SURE THERE IS NO SPACE IN BETWEEN
    // location.within and the unit or you are GOING TO HAVE A BAD TIME
    // i.e. 50mi
    //
    // it must look like ^
    // if not the eventbrite api gives really cryptic and useless errors in that case
    const searchParams = {
      q: query,
      sort_by: "date",
      "location.address": address,
      "location.within": `${mileRadiusWithin}mi`,
      "start_date.range_start": startDatetime,
      "start_date.range_end": endDatetime
    };

    this.metrics.eventbrite.searchParams = searchParams;

    const cacheKeyPrefix = CachedEventbriteService.generateCacheKeyPrefix(searchParams);

    const fullOutputCacheKey = `${cacheKeyPrefix}_full_output`;

    // if we already have the full page just return it
    const fullOutputCacheEntry = await this.cache.get(fullOutputCacheKey);
    this.cacheObjects.push(fullOutputCacheEntry);

    if (fullOutputCacheEntry.isCached) {
      console.log("Full Output Cached Already. Returning that");
      return fullOutputCacheEntry.value;
    }

    // cache first page to get number of pages
    // pages are 1 indexed :/
    let currentPage = 1;

    const firstPageCacheKey = `${CachedEventbriteService.generatePageCacheKey(cacheKeyPrefix, currentPage)}`;
    const firstPageData = await this.cachedSearchRequest(firstPageCacheKey, searchParams);

    // dealing with eventbrite paginated responses
    // https://www.eventbrite.com/platform/api#/introduction/paginated-responses
    currentPage = 2;

    let totalPages = TEST_NUMBER_OF_PAGES; // test version

    if (!testMode) {
      totalPages = parseInt(firstPageData.pagination.page_count, 10);
    }

    // Stepts
    // 1. Get the page from either eventbrite or the cache
    // 2. Write the page out to full_output
    const NUMBER_OF_STEPS = 2;

    const bar = new ProgressBar(" updating [:bar] :percent", {
      complete: "=",
      incomplete: " ",
      width: 40,
      total: totalPages * NUMBER_OF_STEPS
    });

    // tick once because first page.
    bar.tick();

    this.metrics.eventbrite.totalPages = totalPages;
    this.metrics.eventbrite.totalNumberEvents = parseInt(firstPageData.pagination.object_count, 10);

    bar.interrupt(`Parsing ${firstPageData.pagination.object_count} events over ${totalPages} pages...`);

    while (currentPage <= totalPages) {
      // get next page by setting search param
      searchParams.page = currentPage;

      const nextPageCacheKey = `${CachedEventbriteService.generatePageCacheKey(cacheKeyPrefix, currentPage)}`;

      // https://eslint.org/docs/rules/no-await-in-loop
      // we dont want one page failing all other
      // plus lets make it work then think about optimal
      //
      // eslint-disable-next-line no-await-in-loop
      await this.cachedSearchRequest(nextPageCacheKey, searchParams);

      currentPage += 1;
      bar.tick();
    }

    let writtenPages = 1;

    const fullOutput = { event_pages: [] };

    while (writtenPages <= totalPages) {
      // eslint-disable-next-line no-await-in-loop
      const pageCacheEntry = await this.cache.get(
        `${CachedEventbriteService.generatePageCacheKey(cacheKeyPrefix, writtenPages)}`
      );

      if (!pageCacheEntry.isCached) {
        console.error("wrtting uncached entry how did this happen? dumping CachedEventbriteService context...");
        console.error(this);
        process.exit(1);
      }

      fullOutput.event_pages.push(JSON.parse(pageCacheEntry.value));

      writtenPages += 1;
      bar.tick();
    }

    await this.cache.set(fullOutputCacheKey, JSON.stringify(fullOutput));

    const fullOutputCacheObject = await this.cache.get(fullOutputCacheKey);

    return fullOutputCacheObject.value;
  }
}

export default CachedEventbriteService;
