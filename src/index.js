import dotenv from "dotenv"
import commander from "commander"
import eventbrite from "eventbrite"
import to from "await-to-js"
import path from "path"
import fs from "fs-extra"
import util from "util"

dotenv.config()

const DEFAULT_REPORT_NAME = "report_from_today"
const { EVENTBRITE_OAUTH_TOKEN } = process.env

commander
  .description("Good Time Dashboard Data Generator")
  .option("-o, --output-filename", `name of the output json. defaults to ${DEFAULT_REPORT_NAME}`)

commander.parse(process.argv)

async function getEventsFromEventBrite() {
  // Create configured Eventbrite SDK
  const sdk = eventbrite({ token: EVENTBRITE_OAUTH_TOKEN })

  // See: https://www.eventbrite.com/developer/v3/endpoints/users/#ebapi-get-users-id
  const [err, data] = await to(sdk.request("/users/me"))

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

  const [fileReadErr,] = await to(outputFile(OUTPUT_FILE_PATH, await getEventsFromEventBrite()))

  if (fileReadErr) {
    console.error(fileReadErr)
    process.exit(0)
  }

  console.log(`${OUTPUT_FILE_PATH} was saved!`)
}

writeJSON();