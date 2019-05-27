import dotenv from "dotenv"
import commander from "commander"
import eventbrite from "eventbrite"
import to from "await-to-js"
import path from "path"
import fs from "fs-extra"
import util from "util"
import querystring from "querystring"

dotenv.config()

const DEFAULT_REPORT_NAME = "report_from_today"
const { EVENTBRITE_OAUTH_TOKEN, CENTER_POINT_ADDRESS } = process.env

commander
  .description("Good Time Intel Tool Data Generator")
  .option("-o, --output-filename", `name of the output json. defaults to ${DEFAULT_REPORT_NAME}`)

commander.parse(process.argv)

async function getEventsFromEventBrite() {
  // Create configured Eventbrite SDK
  const sdk = eventbrite({ token: EVENTBRITE_OAUTH_TOKEN })

  // See: https://www.eventbrite.com/platform/api#/reference/event-search/search-events

  const searchParams = {
    q:"",
    sort_by: "date",
    "location.address": CENTER_POINT_ADDRESS,
    "location.within": "50mi"
  }

  const [err, data] = await to(sdk.request(`/events/search/?${querystring.stringify(searchParams)}`))

  if (err) {
    console.error(err)
    process.exit(0)
  }

  return JSON.stringify(data)
}

async function writeJSON() {
  let reportName = DEFAULT_REPORT_NAME

  if (commander.outputFilename) {
    reportName = commander.outputFilename
  }

  const outputPathObject = {
    dir: "tmp",
    name: reportName,
    ext: ".json"
  }

  const OUTPUT_FILE_PATH = path.format(outputPathObject)
  const outputFile = util.promisify(fs.outputFile)

  const [fileReadErr] = await to(outputFile(OUTPUT_FILE_PATH, await getEventsFromEventBrite()))

  if (fileReadErr) {
    console.error(fileReadErr)
    process.exit(0)
  }

  console.log(`${OUTPUT_FILE_PATH} was saved!`)
}

writeJSON()
