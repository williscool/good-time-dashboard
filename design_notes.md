## Steps

### Extract  from source (starting with just eventbrite)

- cache so we don't run out of reqs (you get 1000 per hour). cachekey = query params

- start date -> end end (defaults here begining of current day until beginnig of default days ahead)

- get all the pages (its paginated)

questions here? 

do we get all and search after the load phase? or do we search in the intial extraction phase?... answer lets just search ahead of time ... if 

we also don't need to cache forever becasue we don't care about events once they pass.


### Transfrom
- html parser and text extraction for descriptons


### Load

- make it a csv
- upload it to google sheets (we can do this manually)