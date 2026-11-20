// BevTrack UI - 176x176 touch UI for Bangle.js 2
// Data handling and calculations live in the bevtrack library.

var W = g.getWidth();
var H = g.getHeight();
var HEADER_H = 20;
var NAV_H = 18;
var NAV_Y = H - NAV_H;

// Theme with safe fallbacks (the emulator may not provide g.theme)
var THEME = g.theme || {};
if (THEME.fg === undefined) THEME.fg = 0xFFFF;
if (THEME.bg === undefined) THEME.bg = 0x0000;
if (THEME.fg2 === undefined) THEME.fg2 = THEME.fg;
if (THEME.bg2 === undefined) THEME.bg2 = THEME.bg;

var ACCENT_RED = 0xF800;
var ACCENT_GREEN = 0x07E0;

var SCREEN_TITLES = ["Select Drink", "Current Values", "Last Drinks", "Daily Summary"];
var NAV_LABELS = ["Drink", "Now", "Log", "Day"];

// Default serving size (ml) and size step per drink come from the library
var DRINK_SIZES = require('bevtrack').DRINK_SIZES;

var currentScreen = 0;
var selectedDrink = "coffee";
var volume = DRINK_SIZES.coffee.ml;
var lastPos = { x: W / 2, y: H / 2 };
var entries = [];
var settings = { weight: 70, gender: "male", unit: "metric" };
var dateRange = {
  start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  end: new Date()
};

function loadData() {
  entries = require('bevtrack').getRecentEntries(
    require('bevtrack').loadEntries('bevtrack_entries.dat')
  );
  settings = require('bevtrack').loadSettings('bevtrack.settings.json', settings);
  dateRange.start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  dateRange.end = new Date();
}

function fmtTime(ts) {
  var d = new Date(ts);
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

function fmtVolume(ml) {
  if (settings.unit === "imperial") return Math.round(ml / 29.57) + " oz";
  return ml + " ml";
}

function clearArea() {
  g.setColor(THEME.bg);
  g.fillRect(0, 0, W - 1, H - 1);
}

function drawHeader(title) {
  g.setColor(THEME.bg2);
  g.fillRect(0, 0, W - 1, HEADER_H - 1);
  g.setColor(THEME.fg);
  g.setFont("6x8").setFontAlign(0, 0);
  g.drawString(title, W / 2, HEADER_H / 2);
  g.setColor(THEME.fg2);
  g.drawLine(0, HEADER_H, W - 1, HEADER_H);
}

function drawNav() {
  var segW = W / 4;
  for (var i = 0; i < 4; i++) {
    g.setColor(i === currentScreen ? THEME.fg : THEME.bg2);
    g.fillRect(i * segW, NAV_Y, (i + 1) * segW - 1, H - 1);
    g.setColor(i === currentScreen ? THEME.bg : THEME.fg);
    g.setFont("6x8").setFontAlign(0, 0);
    g.drawString(NAV_LABELS[i], i * segW + segW / 2, NAV_Y + NAV_H / 2);
  }
}

function drawPanel(x1, y1, x2, y2, label, value, color) {
  g.setColor(THEME.bg2);
  g.fillRect(x1, y1, x2, y2);
  g.setColor(THEME.fg2);
  g.drawRect(x1, y1, x2, y2);
  g.setColor(THEME.fg);
  g.setFont("6x8").setFontAlign(0, -1);
  g.drawString(label, (x1 + x2) / 2, y1 + 4);
  g.setColor(color || THEME.fg);
  g.setFont("Vector", 18).setFontAlign(0, 0);
  g.drawString(value, (x1 + x2) / 2, (y1 + y2) / 2 + 4);
}

function drawRow(y, label, value, color) {
  g.setColor(THEME.fg);
  g.setFont("6x8").setFontAlign(-1, 0);
  g.drawString(label, 12, y);
  g.setColor(color || THEME.fg);
  g.setFont("Vector", 12).setFontAlign(1, 0);
  g.drawString(value, W - 12, y);
}

// ===== SCREEN 0: SELECT DRINK =====

// Draw outward-pointing triangles that hint at left/right swiping
function drawSwipeHint(cy) {
  g.setColor(THEME.fg2);
  g.fillPoly([22, cy, 30, cy - 6, 30, cy + 6]);
  g.fillPoly([154, cy, 146, cy - 6, 146, cy + 6]);
}

function drawSelectScreen() {
  drawHeader(SCREEN_TITLES[0]);

  var info = require('bevtrack').getBeverageInfo(selectedDrink);
  var name = info ? info.name : selectedDrink;
  var color = info ? info.color : 0xFFFF;

  g.setColor(THEME.fg);
  g.setFont("Vector", 16).setFontAlign(0, 0);
  g.drawString(name, W / 2, 34);

  // Colored circle: swipe to change drink, tap to log it
  g.setColor(color);
  g.fillCircle(W / 2, 72, 22);
  g.setColor(THEME.fg);
  g.drawCircle(W / 2, 72, 22);
  drawSwipeHint(72);

  // Volume: swipe to change the serving size
  g.setColor(THEME.fg);
  g.setFont("Vector", 26).setFontAlign(0, 0);
  g.drawString(fmtVolume(volume), W / 2, 114);
  drawSwipeHint(114);

  g.setColor(THEME.fg2);
  g.setFont("6x8").setFontAlign(0, 0);
  g.drawString("tap circle to log", W / 2, 142);
}

// ===== SCREEN 1: CURRENT VALUES =====

function drawCurrentScreen() {
  drawHeader(SCREEN_TITLES[1]);

  var bac = require('bevtrack').calculateBAC(entries, settings);
  var caff = require('bevtrack').getCaffeineSleepStatus(entries, settings);

  drawPanel(8, 26, 168, 68, "Blood Alcohol", bac.bac.toFixed(3) + "%",
            bac.bac < 0.05 ? ACCENT_GREEN : ACCENT_RED);
  drawPanel(8, 74, 168, 116, "Caffeine remaining", Math.round(caff.remaining) + " mg",
            caff.over ? ACCENT_RED : ACCENT_GREEN);

  g.setColor(THEME.fg2);
  g.setFont("6x8").setFontAlign(0, 0);
  g.drawString("Sleep limit: " + Math.round(caff.limit) + " mg", W / 2, 130);
  g.setColor(caff.over ? ACCENT_RED : ACCENT_GREEN);
  var sleepText = caff.over
    ? "Under limit in " + caff.hoursUntilUnder.toFixed(1) + "h"
    : "OK for sleep";
  g.drawString(sleepText, W / 2, 144);
}

// ===== SCREEN 2: LAST DRINKS =====

function drawLogScreen() {
  drawHeader(SCREEN_TITLES[2]);

  var recent = require('bevtrack').getRecentEntries(entries, 4);
  if (recent.length === 0) {
    g.setColor(THEME.fg);
    g.setFont("6x8").setFontAlign(0, 0);
    g.drawString("No drinks recorded", W / 2, 72);
    g.setColor(THEME.fg2);
    g.drawString("Go to Drink to add one", W / 2, 90);
    return;
  }

  for (var i = 0; i < recent.length; i++) {
    var e = recent[i];
    var info = require('bevtrack').getBeverageInfo(e.type);
    var name = info ? info.name : e.type;
    var color = info ? info.color : 0xFFFF;
    var y = 24 + i * 26;

    if (i % 2 === 0) {
      g.setColor(THEME.bg2);
      g.fillRect(0, y, W - 1, y + 24);
    }

    g.setColor(color);
    g.fillCircle(10, y + 12, 4);

    g.setColor(THEME.fg);
    g.setFont("6x8").setFontAlign(-1, 0);
    g.drawString(name, 20, y + 7);
    g.setFontAlign(1, 0);
    g.drawString(fmtTime(e.timestamp), W - 6, y + 7);

    g.setColor(THEME.fg2);
    g.setFontAlign(-1, 0);
    var detail = fmtVolume(e.volume);
    if (e.caffeine > 0) detail += "  C " + Math.round(e.caffeine) + "mg";
    if (e.alcohol > 0) detail += "  A " + e.alcohol + "g";
    g.drawString(detail, 20, y + 17);
  }

  g.setColor(THEME.fg2);
  g.setFont("6x8").setFontAlign(0, 0);
  g.drawString("tap an entry to delete", W / 2, 142);
}

// ===== SCREEN 3: DAILY SUMMARY =====

function drawSummaryScreen() {
  drawHeader(SCREEN_TITLES[3]);

  var summary = require('bevtrack').getSummary(entries, dateRange.start, dateRange.end);
  var bac = require('bevtrack').calculateBAC(entries, settings);

  g.setColor(THEME.fg2);
  g.setFont("6x8").setFontAlign(0, 0);
  g.drawString("Last 7 days", W / 2, 30);

  drawRow(52, "Drinks", "" + summary.totalDrinks, THEME.fg);
  drawRow(76, "Caffeine", Math.round(summary.totalCaffeine) + " mg", ACCENT_GREEN);
  drawRow(100, "Alcohol", summary.totalAlcohol.toFixed(1) + " g", ACCENT_RED);
  drawRow(124, "Current BAC", bac.bac.toFixed(3) + "%",
          bac.bac < 0.05 ? ACCENT_GREEN : ACCENT_RED);
}

// ===== RENDERING =====

function render() {
  g.reset();
  clearArea();
  switch (currentScreen) {
    case 0: drawSelectScreen(); break;
    case 1: drawCurrentScreen(); break;
    case 2: drawLogScreen(); break;
    case 3: drawSummaryScreen(); break;
  }
  drawNav();
}

// ===== INTERACTIONS =====

function setScreen(s) {
  currentScreen = ((s % 4) + 4) % 4;
  render();
}

function changeDrink(dir) {
  var types = require('bevtrack').getBeverageTypes();
  var i = types.indexOf(selectedDrink);
  selectedDrink = types[(i + dir + types.length) % types.length];
  volume = require('bevtrack').getDefaultVolume(selectedDrink);
  render();
}

function changeVolume(dir) {
  volume += dir * require('bevtrack').getVolumeStep(selectedDrink);
  if (volume < 25) volume = 25;
  if (volume > 1000) volume = 1000;
  render();
}

function addDrink() {
  var info = require('bevtrack').getBeverageInfo(selectedDrink);
  if (!info) return;

  var entry = {
    timestamp: new Date().toISOString(),
    type: selectedDrink,
    volume: volume,
    caffeine: Math.round(info.caffeine * volume / 100),
    alcohol: Math.round(info.alcohol * volume / 100 * 10) / 10,
    notes: ""
  };

  if (require('bevtrack').saveEntry('bevtrack_entries.dat', entry)) {
    loadData();
    setScreen(2);
  }
}

function handleTouch(button, xy) {
  // Hardware button control is intentionally not used; only taps matter.
  if (!xy) return;

  var x = xy.x;
  var y = xy.y;

  if (y >= NAV_Y) {
    setScreen(Math.floor(x / (W / 4)));
    return;
  }

  // Tap the colored circle to log the drink
  if (currentScreen === 0) {
    var dx = x - W / 2, dy = y - 72;
    if (dx * dx + dy * dy <= 26 * 26) addDrink();
    return;
  }

  // Tap an entry on the log screen to delete it
  if (currentScreen === 2) {
    var recent = require('bevtrack').getRecentEntries(entries, 4);
    for (var i = 0; i < recent.length; i++) {
      var top = 24 + i * 26;
      if (y >= top && y <= top + 24) {
        confirmDelete(recent[i]);
        return;
      }
    }
  }
}

// Ask before deleting. E.showPrompt replaces the UI handlers, so
// restore ours once the user has answered.
function confirmDelete(entry) {
  var info = require('bevtrack').getBeverageInfo(entry.type);
  var name = info ? info.name : entry.type;
  var msg = name + " " + fmtVolume(entry.volume) + "\n" + fmtTime(entry.timestamp);
  E.showPrompt(msg, { title: "Delete entry?" }).then(function (yes) {
    if (yes) require('bevtrack').deleteEntry('bevtrack_entries.dat', entry.timestamp);
    loadData();
    setupUI();
    render();
  });
}

function handleSwipe(lr, ud) {
  if (ud !== 0) {
    setScreen(currentScreen + ud);
    return;
  }
  if (lr === 0) return;

  if (currentScreen === 0) {
    if (lastPos.y >= 42 && lastPos.y <= 96) changeDrink(lr);
    else if (lastPos.y >= 98 && lastPos.y <= 140) changeVolume(lr);
  } else {
    setScreen(currentScreen + lr);
  }
}

loadData();
render();

function setupUI() {
  Bangle.setUI({
    mode: "custom",
    touch: handleTouch,
    swipe: handleSwipe,
    drag: function (e) {
      lastPos.x = e.x;
      lastPos.y = e.y;
    }
  });
}
setupUI();
