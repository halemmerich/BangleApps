// BevTrack Library - Core calculation functions
let BEV_TRACK_LIB_VERSION = "0.0.1";

// Descending comparator (Espruino has no String.localeCompare)
function descending(a, b) {
  return a > b ? -1 : (a < b ? 1 : 0);
}

// Beverage definitions: type, caffeine(mg/100ml), alcohol(g/100ml)
// Export to global namespace for testing
exports.BEVERAGES = {
  coffee: {name: "Coffee", caffeine: 80, alcohol: 0, color: 0x0000},
  tea: {name: "Tea", caffeine: 30, alcohol: 0, color: 0x03E0},
  beer: {name: "Beer", caffeine: 10, alcohol: 12, color: 0x001F},
  wine: {name: "Wine", caffeine: 0, alcohol: 16, color: 0xF81F},
  shot: {name: "Shot", caffeine: 0, alcohol: 5.6, color: 0xFF00},
  energy: {name: "Energy", caffeine: 100, alcohol: 0, color: 0x07E0},
  cola: {name: "Cola", caffeine: 40, alcohol: 0, color: 0x7800},
  custom: {name: "Custom", caffeine: 0, alcohol: 0, color: 0xFFFF}
};

// Typical serving size (ml) and size step per beverage
exports.DRINK_SIZES = {
  coffee: {ml: 250, step: 25},
  tea: {ml: 250, step: 25},
  beer: {ml: 500, step: 50},
  wine: {ml: 175, step: 25},
  shot: {ml: 44, step: 5},
  energy: {ml: 250, step: 25},
  cola: {ml: 330, step: 50},
  custom: {ml: 250, step: 25}
};

exports.getDefaultVolume = function (type) {
  let size = exports.DRINK_SIZES[type];
  return size ? size.ml : 250;
};

exports.getVolumeStep = function (type) {
  let size = exports.DRINK_SIZES[type];
  return size ? size.step : 25;
};

exports.parseLogLine = function (line) {
  if (!line || line.trim().length === 0) return null;
  let parts = line.split("|");
  if (parts.length < 5) return null;
  return {
    timestamp: parts[0],
    type: parts[1],
    volume: parseInt(parts[2], 10),
    caffeine: parseInt(parts[3], 10),
    alcohol: parseFloat(parts[4]) || 0,
    notes: parts[5] || ""
  };
};

exports.formatLogLine = function (entry) {
  return entry.timestamp + "|" + entry.type + "|" + entry.volume + "|" + entry.caffeine + "|" + entry.alcohol + "|" + (entry.notes || "");
};

exports.calculateBAC = function (entries, settings, now) {
  now = now || new Date();
  let totalAlcohol = 0, firstDrinkTime = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].alcohol > 0) {
      totalAlcohol += entries[i].alcohol;
      if (!firstDrinkTime || entries[i].timestamp < firstDrinkTime) {
        firstDrinkTime = entries[i].timestamp;
      }
    }
  }
  if (!firstDrinkTime) return {bac: 0, hours: 0, totalAlcohol: 0, firstDrinkTime: null};
  let firstTime = new Date(firstDrinkTime), diff = now - firstTime, hours = diff / (1000 * 60 * 60);
  let weight = settings.weight || 70, factor = (settings.gender === "female") ? 0.60 : 0.70;
  let bac = (totalAlcohol / (weight * factor)) - (0.15 * hours);
  if (bac < 0) bac = 0;
  return {bac: bac, hours: hours, totalAlcohol: totalAlcohol, firstDrinkTime: firstDrinkTime, genderFactor: factor, weight: weight};
};

exports.calculateRemainingCaffeine = function (entries, now) {
  now = now || new Date();
  let totalCaffeine = 0, remaining = 0;
  for (let i = 0; i < entries.length; i++) {
    totalCaffeine += entries[i].caffeine;
    if (entries[i].caffeine > 0) {
      let entryTime = new Date(entries[i].timestamp), age = (now - entryTime) / (1000 * 60 * 60);
      let remainingThis = entries[i].caffeine * Math.pow(0.5, age / 5);
      remaining += remainingThis;
    }
  }
  return {total: totalCaffeine, remaining: remaining, halfLifeHours: 5};
};

exports.calculateCaffeine = function (type, volume) {
  let bev = exports.BEVERAGES[type];
  if (!bev) return 0;
  return bev.caffeine * (volume / 100);
};

exports.calculateAlcohol = function (type, volume) {
  let bev = exports.BEVERAGES[type];
  if (!bev) return 0;
  return bev.alcohol * (volume / 100);
};

exports.getBeverageInfo = function (type) {
  return exports.BEVERAGES[type] || null;
};

exports.getBeverageTypes = function () {
  let types = [];
  for (let key in exports.BEVERAGES) {
    if (exports.BEVERAGES.hasOwnProperty(key)) {
      types.push(key);
    }
  }
  return types;
};

exports.getBeverageNames = function () {
  let names = {};
  for (let key in exports.BEVERAGES) {
    if (exports.BEVERAGES.hasOwnProperty(key)) {
      names[key] = exports.BEVERAGES[key].name;
    }
  }
  return names;
};

exports.loadEntries = function (filePath) {
  let entries = [];
  try {
    let file = require("Storage").open(filePath, "r");
    if (file) {
      let lines = file.read(file.getLength()).split("\n");
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.length > 0) {
          let entry = exports.parseLogLine(line);
          if (entry) {
            entries.push(entry);
          }
        }
      }
    }
  } catch (e) {}
  return entries;
};

exports.loadSettings = function (filePath, defaults) {
  let settings = defaults || {};
  try {
    let saved = require("Storage").readJSON(filePath, 1);
    if (saved) settings = Object.assign(settings, saved);
  } catch (e) {}
  return settings;
};

exports.saveEntry = function (filePath, entry) {
  try {
    let file = require("Storage").open(filePath, "a");
    if (file) {
      file.write(exports.formatLogLine(entry) + "\n");
      return true;
    }
  } catch (e) {}
  return false;
};

exports.deleteEntry = function (filePath, timestamp) {
  let entries = exports.loadEntries(filePath), kept = [], removed = false;
  for (let i = 0; i < entries.length; i++) {
    if (!removed && entries[i].timestamp === timestamp) {
      removed = true;
    } else {
      kept.push(entries[i]);
    }
  }
  if (!removed) return false;
  try {
    require("Storage").open(filePath, "r").erase();
    if (kept.length > 0) {
      let file = require("Storage").open(filePath, "a");
      for (let i = 0; i < kept.length; i++) {
        file.write(exports.formatLogLine(kept[i]) + "\n");
      }
    }
    return true;
  } catch (e) {}
  return false;
};

exports.getRecentEntries = function (entries, limit) {
  if (entries.length > 0 && typeof entries[0] === 'string') {
    let sorted = entries.slice().sort(function(a, b) { return descending(a, b); });
    if (limit && limit < sorted.length) {
      return sorted.slice(0, limit);
    }
    return sorted;
  }
  let sorted = entries.slice().sort(function(a, b) { return descending(a.timestamp, b.timestamp); });
  if (limit && limit < sorted.length) {
    return sorted.slice(0, limit);
  }
  return sorted;
};

exports.groupEntriesByDate = function (entries) {
  let grouped = {};
  for (let i = 0; i < entries.length; i++) {
    let entry = entries[i], date = new Date(entry.timestamp).toISOString().split("T")[0];
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(entry);
  }
  let sortedDates = Object.keys(grouped).sort().reverse(), result = {};
  for (let i = 0; i < sortedDates.length; i++) {
    result[sortedDates[i]] = grouped[sortedDates[i]];
  }
  return result;
};

exports.getEntriesInRange = function (entries, startDate, endDate) {
  let filtered = [];
  for (let i = 0; i < entries.length; i++) {
    let entryDate = new Date(entries[i].timestamp);
    if (entryDate >= startDate && entryDate <= endDate) {
      filtered.push(entries[i]);
    }
  }
  return filtered.sort(function(a, b) { return descending(a.timestamp, b.timestamp); });
};

exports.getTotalAlcohol = function (entries, startDate, endDate) {
  let filtered = exports.getEntriesInRange(entries, startDate, endDate), total = 0;
  for (let i = 0; i < filtered.length; i++) {
    total += filtered[i].alcohol;
  }
  return total;
};

exports.getTotalCaffeine = function (entries, startDate, endDate) {
  let filtered = exports.getEntriesInRange(entries, startDate, endDate), total = 0;
  for (let i = 0; i < filtered.length; i++) {
    total += filtered[i].caffeine;
  }
  return total;
};

exports.getSummary = function (entries, startDate, endDate) {
  return {
    totalDrinks: exports.getEntriesInRange(entries, startDate, endDate).length,
    totalCaffeine: exports.getTotalCaffeine(entries, startDate, endDate),
    totalAlcohol: exports.getTotalAlcohol(entries, startDate, endDate)
  };
};

exports.getEntriesByType = function (entries, type) {
  let filtered = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type === type) {
      filtered.push(entries[i]);
    }
  }
  return filtered.sort(function(a, b) { return descending(a.timestamp, b.timestamp); });
};

exports.calculateSingleDrinkBAC = function (weight, gender, type, volume, drinkTime, now) {
  now = now || new Date();
  let alcohol = exports.calculateAlcohol(type, volume), diff = now - drinkTime, hours = diff / (1000 * 60 * 60);
  let factor = (gender === "female") ? 0.60 : 0.70;
  let bac = (alcohol / (weight * factor)) - (0.15 * hours);
  if (bac < 0) bac = 0;
  return bac;
};

exports.calculateSingleDrinkCaffeine = function (volume, type, drinkTime, now) {
  now = now || new Date();
  let caffeine = exports.calculateCaffeine(type, volume), diff = now - drinkTime, hours = diff / (1000 * 60 * 60);
  let remaining = caffeine * Math.pow(0.5, hours / 5);
  return remaining;
};

exports.BEV_TRACK_LIB_VERSION = BEV_TRACK_LIB_VERSION;
