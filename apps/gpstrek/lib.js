const STORAGE = require("Storage");

const MODE_MENU = 0;
const MODE_MAP = 1;
const MODE_SLICES = 2;

function readSettings() {
  return Object.assign(
    STORAGE.readJSON("gpstrek.default.json", true) || {},
    STORAGE.readJSON("gpstrek.json", true) || {}
  );
}

const SETTINGS = readSettings();

function radians(a) {
  return a * Math.PI / 180;
}

function degrees(a) {
  let d = a * 180 / Math.PI;
  return (d + 360) % 360;
}

function isValidPosition(p) {
  return p && isFinite(p.lat) && isFinite(p.lon);
}

function bearing(a, b) {
  if (!isValidPosition(a) || !isValidPosition(b)) return Infinity;
  let delta = radians(b.lon - a.lon);
  let alat = radians(a.lat);
  let blat = radians(b.lat);
  let y = Math.sin(delta) * Math.cos(blat);
  let x = Math.cos(alat) * Math.sin(blat) -
    Math.sin(alat) * Math.cos(blat) * Math.cos(delta);
  return Math.round(degrees(Math.atan2(y, x)));
}

function distance(a, b) {
  if (!isValidPosition(a) || !isValidPosition(b)) return Infinity;
  let x = radians(a.lon - b.lon) * Math.cos(radians((a.lat + b.lat) / 2));
  let y = radians(b.lat - a.lat);
  return Math.round(Math.sqrt(x * x + y * y) * 6371000);
}

/**
 * Average compass headings. Uses vector averaging so that 359 and 1
 * average to 0 instead of 180.
 */
function averageHeading(samples) {
  let s = 0;
  let c = 0;
  for (let h of samples) {
    s += Math.sin(radians(h));
    c += Math.cos(radians(h));
  }
  s /= samples.length;
  c /= samples.length;
  let result = degrees(Math.atan(s / c));

  if (c < 0) result += 180;
  if (s < 0 && c > 0) result += 360;

  result %= 360;
  return result;
}

function parseNumber(toParse) {
  if (toParse.includes(".")) return parseFloat(toParse);
  return parseFloat("" + toParse + ".0");
}

function parseName(filename, offset, result) {
  let nameLength = STORAGE.read(filename, offset, 2) - 0;
  result.name = STORAGE.read(filename, offset += 2, nameLength);
  return offset + nameLength;
}

function parseWaypoint(filename, offset, result) {
  result.lat = parseNumber(STORAGE.read(filename, offset, 11));
  result.lon = parseNumber(STORAGE.read(filename, offset += 11, 12));
  return offset + 12;
}

function parseWaypointWithElevation(filename, offset, result) {
  offset = parseWaypoint(filename, offset, result);
  result.alt = parseNumber(STORAGE.read(filename, offset, 6));
  return offset + 6;
}

function parseWaypointWithName(filename, offset, result) {
  offset = parseWaypoint(filename, offset, result);
  return parseName(filename, offset, result);
}

function parseWaypointWithElevationAndName(filename, offset, result) {
  offset = parseWaypointWithElevation(filename, offset, result);
  return parseName(filename, offset, result);
}

let cache = {};
let cachedOffsets = [];

function clearCache() {
  cache = {};
  cachedOffsets = [];
}

function getCacheSize() {
  return cachedOffsets.length;
}

function getFromCache(filename, offset, result) {
  if (filename == cache.filename && cache[offset]) {
    Object.assign(result, cache[offset]);
    result.access = Date.now();
    return offset + cache[offset].fileLength;
  }
  return offset;
}

function cacheCleanup() {
  if (SETTINGS.cacheMinFreeMem) {
    while (cachedOffsets.length > 0 && process.memory(false).free < SETTINGS.cacheMinFreeMem) {
      cache[cachedOffsets.shift()] = undefined;
    }
  }
  if (SETTINGS.cacheMaxEntries) {
    while (cachedOffsets.length > SETTINGS.cacheMaxEntries) {
      cache[cachedOffsets.shift()] = undefined;
    }
  }
}

function cacheAdd(filename, result) {
  cacheCleanup();
  if (cache.filename != filename) {
    cache = {};
    cache.filename = filename;
  }
  cache[result.fileOffset] = result;
  cachedOffsets.push(result.fileOffset);
}

function getEntry(filename, offset, result, noCaching) {
  if (offset < 0) return offset;
  let cacheOffset = getFromCache(filename, offset, result);
  if (cacheOffset != offset) return cacheOffset;
  result.fileOffset = offset;
  let type = STORAGE.read(filename, offset++, 1);
  if (type == "") return -1;
  switch (type) {
    case "A":
      offset = parseWaypoint(filename, offset, result);
      break;
    case "B":
      offset = parseWaypointWithName(filename, offset, result);
      break;
    case "C":
      offset = parseWaypointWithElevation(filename, offset, result);
      break;
    case "D":
      offset = parseWaypointWithElevationAndName(filename, offset, result);
      break;
    default:
      print("Unknown entry type", type);
      return -1;
  }
  offset++;

  result.fileLength = offset - result.fileOffset;
  if (!noCaching && (SETTINGS.cacheMaxEntries || SETTINGS.cacheMinFreeMem)) {
    cacheAdd(filename, result);
  }
  return offset;
}

function getFileSize(filename) {
  return STORAGE.readArrayBuffer(filename).byteLength;
}

function writeUint24(filename, number, offset, size) {
  let b = new ArrayBuffer(3);
  let n = new Uint24Array(b, 0, 1);
  n[0] = number;
  STORAGE.write(filename, b, offset, size);
}

function writeUint32(filename, number, offset, size) {
  let b = new ArrayBuffer(4);
  let n = new Uint32Array(b, 0, 1);
  n[0] = number;
  STORAGE.write(filename, b, offset, size);
}

function getIndexFileName(filename) {
  return filename.substring(0, filename.length - 1) + "i";
}

function getRouteIndex(route) {
  if (!route.indexToOffset) loadIndex(route);
  return route.indexToOffset;
}

function loadIndex(routeInfo) {
  routeInfo.indexToOffset = new Uint24Array(
    STORAGE.readArrayBuffer(getIndexFileName(routeInfo.filename)), 4, routeInfo.count
  );
}

function loadRouteData(filename, progressMonitor) {
  let routeInfo = {};

  routeInfo.filename = filename;

  let scanOffset = 0;
  routeInfo.length = 0;
  routeInfo.mirror = false;
  let lastSeenWaypoint;
  let lastSeenAlt;
  let waypoint = {};
  let count = 0;

  routeInfo.up = 0;
  routeInfo.down = 0;

  let trfHash = E.CRC32(STORAGE.read(filename));
  let size = getFileSize(filename);
  let indexFileName = getIndexFileName(filename);
  // shortest possible entry is 24 characters + linebreak, 3 bytes per entry, 4 bytes hash in front
  let indexFileSize = Math.ceil(size / 25 * 3 + 4);
  let createIndexFile = !STORAGE.read(indexFileName);
  if (!createIndexFile) {
    let currentHash = new Uint32Array(STORAGE.readArrayBuffer(indexFileName), 0, 1)[0];
    if (currentHash != trfHash) {
      createIndexFile = true;
    }
  }

  // write hash into index file, will be recreated by this
  if (createIndexFile)
    writeUint32(indexFileName, trfHash, 0, indexFileSize);

  while ((scanOffset = getEntry(filename, scanOffset, waypoint, true)) > 0) {
    if (count % 5 == 0) progressMonitor(scanOffset, "Loading", size);
    if (lastSeenWaypoint) {
      let dist = distance(lastSeenWaypoint, waypoint);
      if (isFinite(dist)) routeInfo.length += dist;

      if (isFinite(waypoint.alt) && isFinite(lastSeenAlt)) {
        let diff = waypoint.alt - lastSeenAlt;
        if (diff > 3) {
          routeInfo.up += diff;
        } else if (diff < -3) {
          routeInfo.down -= diff;
        }
      }
    }
    if (createIndexFile) writeUint24(indexFileName, waypoint.fileOffset, 4 + count * 3, indexFileSize);
    count++;
    lastSeenWaypoint = waypoint;
    if (isFinite(waypoint.alt)) lastSeenAlt = waypoint.alt;
    waypoint = {};
  }
  routeInfo.count = count;
  loadIndex(routeInfo);

  set(routeInfo, 0);
  return routeInfo;
}

function getWaypointIndex(route, index) {
  if (isNaN(index)) index = route.index;
  return route.mirror ? getRouteIndex(route).length - 1 - index : index;
}

function setWaypointIndex(route, waypointIndex) {
  if (route.mirror)
    route.index = getRouteIndex(route).length - 1 - waypointIndex;
  else
    route.index = waypointIndex;
}

function hasPrev(route, index) {
  if (isNaN(index)) index = getWaypointIndex(route);
  return index > 0;
}

function hasNext(route, index, count) {
  if (count === undefined) count = 1;
  if (isNaN(index)) index = route.index;
  return getWaypointIndex(route, index) + count < (getRouteIndex(route).length);
}

function getNext(route, index, count) {
  if (count === undefined) count = 1;
  if (isNaN(index)) index = getWaypointIndex(route);
  index += count;
  if (index >= getRouteIndex(route).length || index < 0) return;
  let result = {};
  getEntry(route.filename, getRouteIndex(route)[getWaypointIndex(route, index)], result);
  return result;
}

function get(route, index) {
  if (isNaN(index)) index = getWaypointIndex(route);
  if (index >= getRouteIndex(route).length || index < 0) return;
  let result = {};
  getEntry(route.filename, getRouteIndex(route)[getWaypointIndex(route, index)], result);
  return result;
}

function getPrev(route, index) {
  return getNext(route, index, -1);
}

function next(route) {
  if (!hasNext(route)) return;
  set(route, getWaypointIndex(route) + 1);
}

function prev(route) {
  if (!hasPrev(route)) return;
  set(route, getWaypointIndex(route) - 1);
}

function set(route, index) {
  if (!route) return;
  route.index = getWaypointIndex(route, index);
}

function getLast(route) {
  return get(route, getRouteIndex(route).length - 1);
}

function isLast(route, index) {
  if (isNaN(index)) index = route.index;
  index = getWaypointIndex(route, index);
  return getRouteIndex(route).length - 1 == index;
}

/**
 * Select the waypoint closest to currentPos.
 * If startindex is not a finite number the search stops at the first
 * waypoint that gets farther away again.
 */
function setClosestWaypoint(route, startindex, progress, maxDist, currentPos) {
  let stopSearchAfterFirstMatch = !isFinite(startindex);
  if (!startindex) startindex = 0;
  if (startindex >= getRouteIndex(route).length) startindex = getRouteIndex(route).length - 1;
  if (startindex < 0) startindex = 0;

  if (!currentPos || !currentPos.lat) {
    set(route, startindex);
    return;
  }
  if (!maxDist) maxDist = Number.MAX_VALUE;
  let minDist = maxDist;
  let mincount = 0;

  let count = 0;
  let wp;
  do {
    if (progress && (count % 5 == 0)) progress(count + startindex, "Searching", getRouteIndex(route).length);
    wp = getNext(route, startindex, count);
    if (!wp) break;
    let curDist = distance(currentPos, wp);
    if (curDist > maxDist) {
      break;
    }
    if (curDist < minDist) {
      minDist = curDist;
      mincount = count;
    } else {
      if (stopSearchAfterFirstMatch) break;
    }
    count++;
  } while (wp);
  set(route, startindex + mincount);
}

exports.MODE_MENU = MODE_MENU;
exports.MODE_MAP = MODE_MAP;
exports.MODE_SLICES = MODE_SLICES;
exports.SETTINGS = SETTINGS;
exports.readSettings = readSettings;
exports.radians = radians;
exports.degrees = degrees;
exports.bearing = bearing;
exports.distance = distance;
exports.averageHeading = averageHeading;
exports.parseNumber = parseNumber;
exports.getEntry = getEntry;
exports.clearCache = clearCache;
exports.getCacheSize = getCacheSize;
exports.getFileSize = getFileSize;
exports.getIndexFileName = getIndexFileName;
exports.getRouteIndex = getRouteIndex;
exports.loadRouteData = loadRouteData;
exports.getWaypointIndex = getWaypointIndex;
exports.setWaypointIndex = setWaypointIndex;
exports.hasPrev = hasPrev;
exports.hasNext = hasNext;
exports.getNext = getNext;
exports.get = get;
exports.getPrev = getPrev;
exports.next = next;
exports.prev = prev;
exports.set = set;
exports.getLast = getLast;
exports.isLast = isLast;
exports.setClosestWaypoint = setClosestWaypoint;
