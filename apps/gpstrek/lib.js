const STORAGE = require("Storage");

const MODE_MENU = 0;
const MODE_MAP = 1;
const MODE_SLICES = 2;

const ENTRY_EOF = -1;
const ENTRY_INVALID = -2;

// Index layout: hash, marker, then 3 byte offsets. The marker is written
// last so an interrupted build cannot be mistaken for a complete index.
const INDEX_HASH_OFFSET = 0;
const INDEX_MARKER_OFFSET = 4;
const INDEX_OFFSETS_START = 5;
const INDEX_MARKER = 0xA5;
const EMPTY_INDEX = [];

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

function clamp(value, min, max) {
  if (!isFinite(value)) return min;
  return value < min ? min : (value > max ? max : value);
}

function isValidPosition(p) {
  return p && isFinite(p.lat) && isFinite(p.lon) &&
    p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180;
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
  if (typeof toParse != "string" || !toParse.length) return NaN;
  if (toParse.includes(".")) return parseFloat(toParse);
  return parseFloat("" + toParse + ".0");
}

function parseName(filename, offset, result) {
  let nameLength = Number(STORAGE.read(filename, offset, 2));
  if (!isFinite(nameLength) || nameLength < 0) return -1;
  let name = STORAGE.read(filename, offset + 2, nameLength);
  if (typeof name != "string" || name.length != nameLength) return -1;
  result.name = name;
  return offset + 2 + nameLength;
}

function parseWaypoint(filename, offset, result) {
  result.lat = parseNumber(STORAGE.read(filename, offset, 11));
  result.lon = parseNumber(STORAGE.read(filename, offset + 11, 12));
  return offset + 23;
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

  // Skip blank lines between entries.
  let type;
  while (true) {
    type = STORAGE.read(filename, offset, 1);
    if (!type) return ENTRY_EOF;
    if (type != "\n" && type != "\r") break;
    offset++;
  }

  result.fileOffset = offset;
  offset++;
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
      result.error = "Unknown entry type " + type;
      return ENTRY_INVALID;
  }
  if (offset < 0) {
    result.error = "Truncated entry";
    return ENTRY_INVALID;
  }
  offset++;
  if (!isValidPosition(result)) {
    result.error = "Invalid position";
    return ENTRY_INVALID;
  }

  result.fileLength = offset - result.fileOffset;
  if (!noCaching && (SETTINGS.cacheMaxEntries || SETTINGS.cacheMinFreeMem)) {
    cacheAdd(filename, result);
  }
  return offset;
}

function getFileSize(filename) {
  let buffer = STORAGE.readArrayBuffer(filename);
  return buffer ? buffer.byteLength : 0;
}

function writeUint8(filename, number, offset, size) {
  let b = new ArrayBuffer(1);
  new Uint8Array(b)[0] = number & 0xFF;
  STORAGE.write(filename, b, offset, size);
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

function indexFileSizeFor(fileSize) {
  // shortest entry is 25 bytes, 3 bytes per offset, plus hash/marker
  return Math.ceil(fileSize / 25 * 3 + 6);
}

function readIndexBuffer(indexFileName) {
  try {
    return STORAGE.readArrayBuffer(indexFileName);
  } catch (e) {
    return undefined;
  }
}

function isValidIndexBuffer(buffer, count) {
  if (!buffer || buffer.byteLength < INDEX_OFFSETS_START + count * 3) return false;
  return new Uint8Array(buffer)[INDEX_MARKER_OFFSET] == INDEX_MARKER;
}

/** Rebuild the offset index by scanning the route file. */
function buildIndexFile(filename) {
  let fileSize = getFileSize(filename);
  let indexFileName = getIndexFileName(filename);
  let indexFileSize = indexFileSizeFor(fileSize);
  STORAGE.erase(indexFileName);
  writeUint32(indexFileName, E.CRC32(STORAGE.read(filename) || ""), INDEX_HASH_OFFSET, indexFileSize);
  let offset = 0;
  let count = 0;
  let waypoint = {};
  while (true) {
    offset = getEntry(filename, offset, waypoint, true);
    if (offset === ENTRY_INVALID) return -1;
    if (offset === ENTRY_EOF) break;
    writeUint24(indexFileName, waypoint.fileOffset, INDEX_OFFSETS_START + count * 3, indexFileSize);
    count++;
    waypoint = {};
  }
  // Marker is written last, so an interrupted build is always detected.
  writeUint8(indexFileName, INDEX_MARKER, INDEX_MARKER_OFFSET, indexFileSize);
  return count;
}

function getRouteIndex(route) {
  if (!route) return EMPTY_INDEX;
  if (!route.indexToOffset) loadIndex(route);
  return route.indexToOffset || EMPTY_INDEX;
}

function loadIndex(routeInfo) {
  if (!routeInfo || !routeInfo.filename) return;
  let count = routeInfo.count || 0;
  if (!count) {
    routeInfo.indexToOffset = EMPTY_INDEX;
    return;
  }
  let indexFileName = getIndexFileName(routeInfo.filename);
  let buffer = readIndexBuffer(indexFileName);
  if (!isValidIndexBuffer(buffer, count)) {
    if (buildIndexFile(routeInfo.filename) != count) {
      routeInfo.indexToOffset = EMPTY_INDEX;
      return;
    }
    buffer = readIndexBuffer(indexFileName);
  }
  if (!isValidIndexBuffer(buffer, count)) {
    routeInfo.indexToOffset = EMPTY_INDEX;
    return;
  }
  routeInfo.indexToOffset = new Uint24Array(buffer, INDEX_OFFSETS_START, count);
}

function loadRouteData(filename, progressMonitor) {
  let routeInfo = {};

  routeInfo.filename = filename;
  routeInfo.length = 0;
  routeInfo.mirror = false;
  routeInfo.up = 0;
  routeInfo.down = 0;
  routeInfo.count = 0;

  let size = getFileSize(filename);
  let trfHash = E.CRC32(STORAGE.read(filename) || "");
  let indexFileName = getIndexFileName(filename);
  let indexFileSize = indexFileSizeFor(size);

  let createIndexFile = true;
  let indexBuffer = readIndexBuffer(indexFileName);
  if (isValidIndexBuffer(indexBuffer, 0)) {
    let currentHash = new Uint32Array(indexBuffer, INDEX_HASH_OFFSET, 1)[0];
    if (currentHash == trfHash) createIndexFile = false;
  }

  if (createIndexFile) {
    STORAGE.erase(indexFileName);
    writeUint32(indexFileName, trfHash, INDEX_HASH_OFFSET, indexFileSize);
  }

  let scanOffset = 0;
  let lastSeenWaypoint;
  let lastSeenAlt;
  let waypoint = {};
  let count = 0;

  while (true) {
    let offset = getEntry(filename, scanOffset, waypoint, true);
    if (offset === ENTRY_EOF) break;
    if (offset === ENTRY_INVALID) {
      throw new Error((waypoint.error || "Invalid route data") +
        " at offset " + waypoint.fileOffset);
    }
    if (count % 5 == 0 && progressMonitor) progressMonitor(offset, "Loading", size);
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
    if (createIndexFile)
      writeUint24(indexFileName, waypoint.fileOffset, INDEX_OFFSETS_START + count * 3, indexFileSize);
    count++;
    lastSeenWaypoint = waypoint;
    if (isFinite(waypoint.alt)) lastSeenAlt = waypoint.alt;
    waypoint = {};
    scanOffset = offset;
  }
  // Marker last: a partially built index is rejected on the next load.
  if (createIndexFile)
    writeUint8(indexFileName, INDEX_MARKER, INDEX_MARKER_OFFSET, indexFileSize);

  if (!count) throw new Error("Route is empty or missing: " + filename);

  routeInfo.count = count;
  loadIndex(routeInfo);

  set(routeInfo, 0);
  return routeInfo;
}

function getWaypointIndex(route, index) {
  if (!route) return 0;
  if (isNaN(index)) index = route.index;
  if (isNaN(index)) index = 0;
  return route.mirror ? getRouteIndex(route).length - 1 - index : index;
}

function setWaypointIndex(route, waypointIndex) {
  if (!route) return;
  if (route.mirror)
    route.index = getRouteIndex(route).length - 1 - waypointIndex;
  else
    route.index = waypointIndex;
}

function hasPrev(route, index) {
  if (!route) return false;
  if (isNaN(index)) index = getWaypointIndex(route);
  return index > 0;
}

function hasNext(route, index, count) {
  if (!route) return false;
  if (count === undefined) count = 1;
  if (isNaN(index)) index = route.index;
  return getWaypointIndex(route, index) + count < (getRouteIndex(route).length);
}

function getNext(route, index, count) {
  if (count === undefined) count = 1;
  if (!route) return;
  if (isNaN(index)) index = getWaypointIndex(route);
  index += count;
  if (index >= getRouteIndex(route).length || index < 0) return;
  let result = {};
  let fileOffset = getRouteIndex(route)[getWaypointIndex(route, index)];
  if (fileOffset === undefined) return;
  getEntry(route.filename, fileOffset, result);
  return result;
}

function get(route, index) {
  if (!route) return;
  if (isNaN(index)) index = getWaypointIndex(route);
  if (index >= getRouteIndex(route).length || index < 0) return;
  let result = {};
  let fileOffset = getRouteIndex(route)[getWaypointIndex(route, index)];
  if (fileOffset === undefined) return;
  getEntry(route.filename, fileOffset, result);
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
  if (!route) return;
  return get(route, getRouteIndex(route).length - 1);
}

function isLast(route, index) {
  if (!route) return true;
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
  if (!route) return;
  let indexLength = getRouteIndex(route).length;
  if (!indexLength) return;

  let stopSearchAfterFirstMatch = !isFinite(startindex);
  if (!startindex) startindex = 0;
  if (startindex >= indexLength) startindex = indexLength - 1;
  if (startindex < 0) startindex = 0;

  if (!isValidPosition(currentPos)) {
    set(route, startindex);
    return;
  }
  if (!maxDist) maxDist = Number.MAX_VALUE;
  let minDist = maxDist;
  let mincount = 0;

  let count = 0;
  let wp;
  do {
    if (progress && (count % 5 == 0)) progress(count + startindex, "Searching", indexLength);
    wp = getNext(route, startindex, count);
    if (!wp) break;
    let curDist = distance(currentPos, wp);
    if (!isFinite(curDist) || curDist > maxDist) {
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
exports.clamp = clamp;
exports.isValidPosition = isValidPosition;
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
