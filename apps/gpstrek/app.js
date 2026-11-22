{ //run in own scope for fast switch

const lib = require("gpstrek.lib.js");
const MODE_MENU = lib.MODE_MENU;
const MODE_MAP = lib.MODE_MAP;
const MODE_SLICES = lib.MODE_SLICES;

const STORAGE = require("Storage");
const BAT_FULL = (STORAGE.readJSON("setting.json", true) || {}).batFullVoltage || 0.3144;
const SETTINGS = lib.SETTINGS;

let drawTimeout;
let scheduleDraw = false;
let firstDraw = true;

let ui = require("gpstrek.ui.js").create({
  settings: SETTINGS,
  batFullVoltage: BAT_FULL,
  getState: function () {
    return WIDGETS.gpstrek.getState();
  }
});

let init = function () {
  Bangle.loadWidgets();
  WIDGETS.gpstrek.start(false);
  if (!WIDGETS.gpstrek.getState().mode) WIDGETS.gpstrek.getState().mode = MODE_MENU;
};

init();

let onAction = function (_, xy) {
  ui.cancelTasks();
  ui.forceRedraw();
  if (WIDGETS.gpstrek.getState().mode == MODE_MAP) {
    stopDrawing();
    if (xy && xy.y > Bangle.appRect.y + Bangle.appRect.h - g.getHeight() * 0.2 && xy.y <= Bangle.appRect.y2) {
      if (xy.x < Bangle.appRect.x + Bangle.appRect.w / 2)
        ui.zoom(-1);
      else
        ui.zoom(1);
    } else if (ui.isOverview() && xy && xy.y > Bangle.appRect.y) {
      ui.toggleScrolling();
    }
    startDrawing();
  }
};

let onSwipe = function (dirLR, dirUD) {
  let s = WIDGETS.gpstrek.getState();
  ui.cancelTasks();
  ui.forceRedraw();

  if (s.mode == MODE_MAP) {
    if (!ui.isScrolling()) {
      if (dirLR > 0) {
        switchMode(MODE_MENU);
      } else if (dirLR < 0) {
        switchMode(MODE_SLICES);
      }
      if (dirUD) {
        ui.toggleOverview();
        startDrawing();
      }
    } else {
      ui.scrollOverview(dirLR, dirUD);
    }
  } else if (s.mode == MODE_SLICES) {
    if (dirLR > 0) {
      if (s.route) {
        switchMode(MODE_MAP);
      } else {
        switchMode(MODE_MENU);
      }
    } else if (dirLR < 0) {
      switchMode(MODE_MENU);
    }
    if (dirUD) {
      setSlicesPage(dirUD);
    }
  } else {
    if (dirLR > 0) {
      switchMode(MODE_SLICES);
    } else if (dirLR < 0) {
      if (s.route) {
        switchMode(MODE_MAP);
      } else {
        switchMode(MODE_SLICES);
      }
    }
  }
};

let setButtons = function () {
  Bangle.removeListener("swipe", onSwipe);
  let options = {
    mode: "custom",
    swipe: onSwipe,
    btn: onAction,
    touch: onAction,
  };
  Bangle.setUI(options);
};

let removeMenu = function () {
  let s = WIDGETS.gpstrek.getState();
  E.showMenu();
  switch (searchNeeded) {
    case 1:
      lib.setClosestWaypoint(s.route, lib.getWaypointIndex(s.route), showProgress, undefined, s.currentPos);
      break;
    case 2:
      lib.setClosestWaypoint(s.route, 0, showProgress, undefined, s.currentPos);
      break;
  }
  searchNeeded = 0;
  onSwipe(-1, 0);
};

let showProgress = function (progress, title, max) {
  let message = title ? title : "Loading";
  if (max) {
    message += " " + E.clip((progress / max * 100), 0, 100).toFixed(0) + "%";
  } else {
    let dots = progress % 4;
    for (let i = 0; i < dots; i++) message += ".";
    for (let i = dots; i < 4; i++) message += " ";
  }
  E.showMessage(message);
};

let handleLoading = function (c) {
  E.showMenu();
  let s = WIDGETS.gpstrek.getState();
  let oldRoute = s.route;
  try {
    s.route = lib.loadRouteData(c, showProgress);
  } catch (e) {
    s.route = oldRoute;
    E.showAlert("Could not load route\n" + (e && e.message ? e.message : e))
      .then(showRouteMenu);
    return false;
  }
  if (SETTINGS.autosearch && searchNeeded < 2) searchNeeded = 2;
  s.waypoint = null;
  return true;
};

let showRouteSelector = function () {
  var menu = {
    "": {
      back: showRouteMenu,
    }
  };

  STORAGE.list(/\.trf$/).sort().forEach((file) => {
    menu[file] = () => { if (handleLoading(file)) showRouteMenu() };
  });

  E.showMenu(menu);
};

// 1 for complete search, 2 for starting at current waypoint
let searchNeeded = 0;

let showRouteMenu = function () {
  var menu = {
    "": {
      "title": "Route",
      back: showMenu,
    },
    "Select file": showRouteSelector
  };

  let s = WIDGETS.gpstrek.getState();

  if (s.route) {
    menu.Mirror = {
      value: s && s.route && !!s.route.mirror || false,
      onchange: v => {
        if (s.route.mirror != v) {
          s.route.mirror = v;
          if (SETTINGS.autosearch)
            if (searchNeeded < 2) searchNeeded = 2;
          else
            lib.setWaypointIndex(s.route, 0);
        }
      }
    };
    menu['Select closest waypoint'] = function () {
      if (lib.isValidPosition(s.currentPos)) {
        if (searchNeeded < 2) searchNeeded = 2;
        removeMenu();
      } else {
        E.showAlert("No position").then(() => { E.showMenu(menu); });
      }
    };
    menu['Select closest waypoint (not visited)'] = function () {
      if (lib.isValidPosition(s.currentPos)) {
        if (searchNeeded < 1) searchNeeded = 1;
        removeMenu();
      } else {
        E.showAlert("No position").then(() => { E.showMenu(menu); });
      }
    };
    menu['Select waypoint'] = {
      value: lib.getWaypointIndex(s.route),
      min: 0, max: lib.getRouteIndex(s.route).length - 1, step: 1,
      onchange: v => { lib.setWaypointIndex(s.route, v); }
    };
    menu['Select waypoint as current position'] = function () {
      let c = lib.get(s.route);
      if (!c) return;
      if (!s.currentPos) s.currentPos = {};
      s.currentPos.lat = c.lat;
      s.currentPos.lon = c.lon;
      s.currentPos.alt = c.alt;
      removeMenu();
    };
  }

  if (s.route && lib.hasPrev(s.route))
    menu['Previous waypoint'] = function () { lib.prev(s.route); removeMenu(); };
  if (s.route && lib.hasNext(s.route))
    menu['Next waypoint'] = function () { lib.next(s.route); removeMenu(); };
  E.showMenu(menu);
};

let showWaypointSelector = function () {
  let waypoints = require("waypoints").load();
  var menu = {
    "": {
      back: showWaypointMenu,
    }
  };

  waypoints.forEach((wp, c) => {
    menu[waypoints[c].name] = function () {
      let s = WIDGETS.gpstrek.getState();
      s.waypoint = waypoints[c];
      s.waypointIndex = c;
      s.route = null;
      removeMenu();
    };
  });

  E.showMenu(menu);
};

let showCalibrationMenu = function () {
  let menu = {
    "": {
      "title": "Calibration",
      back: showMenu,
    },
    "Barometer (GPS)": () => {
      let s = WIDGETS.gpstrek.getState();
      if (!s.currentPos || isNaN(s.currentPos.alt)) {
        E.showAlert("No GPS altitude").then(() => { E.showMenu(menu); });
      } else {
        s.calibAltDiff = s.altitude - s.currentPos.alt;
        E.showAlert("Calibrated Altitude Difference: " + s.calibAltDiff.toFixed(0)).then(() => { removeMenu(); });
      }
    },
    "Barometer (Manual)": {
      value: Math.round(WIDGETS.gpstrek.getState().currentPos && (WIDGETS.gpstrek.getState().currentPos.alt != undefined && isFinite(WIDGETS.gpstrek.getState().currentPos.alt)) ? WIDGETS.gpstrek.getState().currentPos.alt : WIDGETS.gpstrek.getState().altitude),
      min: -2000, max: 10000, step: 1,
      onchange: v => { WIDGETS.gpstrek.getState().calibAltDiff = WIDGETS.gpstrek.getState().altitude - v; }
    },
    "Reset Compass": () => { Bangle.resetCompass(); removeMenu(); },
  };
  E.showMenu(menu);
};

let showWaypointMenu = function () {
  let menu = {
    "": {
      "title": "Waypoint",
      back: showMenu,
    },
    "Select waypoint": showWaypointSelector,
  };
  E.showMenu(menu);
};

let showBackgroundMenu = function () {
  let menu = {
    "": {
      "title": "Background",
      back: showMenu,
    },
    "Start": () => { E.showPrompt("Start?").then((v) => { if (v) { WIDGETS.gpstrek.start(true); showMenu(); } else { showMenu(); } }).catch(() => { showMenu(); }); },
    "Stop": () => { E.showPrompt("Stop?").then((v) => { if (v) { WIDGETS.gpstrek.stop(true); showMenu(); } else { showMenu(); } }).catch(() => { showMenu(); }); },
  };
  E.showMenu(menu);
};

let showMenu = function () {
  var mainmenu = {
    "": {
      "title": "Main",
      back: removeMenu,
    },
    "Route": showRouteMenu,
    "Waypoint": showWaypointMenu,
    "Background": showBackgroundMenu,
    "Calibration": showCalibrationMenu,
    "Reset": () => { E.showPrompt("Do Reset?").then((v) => { if (v) { WIDGETS.gpstrek.resetState(); removeMenu(); } else { E.showMenu(mainmenu); } }).catch(() => { E.showMenu(mainmenu); }); },
  };

  E.showMenu(mainmenu);
  Bangle.removeListener("swipe", onSwipe);
  Bangle.on("swipe", onSwipe);
};

let switchMenu = function () {
  stopDrawing();
  showMenu();
};

let stopDrawing = function () {
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = undefined;
  scheduleDraw = false;
  ui.cancelTasks();
};

let startDrawing = function () {
  firstDraw = true;
  scheduleDraw = true;
  draw();
  drawInTimeout();
};

let drawInTimeout = function () {
  if (drawTimeout) return;
  let refresh = Bangle.isLocked() ? SETTINGS.refreshLocked : SETTINGS.refresh;
  if (!isFinite(refresh) || refresh < 100) refresh = 500;
  drawTimeout = setTimeout(() => {
    drawTimeout = undefined;
    draw();
  }, refresh);
};

let switchNav = function () {
  setButtons();
  startDrawing();
};

let page_slices = 0;

let setSlicesPage = function (change) {
  page_slices -= change;
  if (page_slices >= ui.getMaxSlicePages()) {
    page_slices = 0;
  }
  if (page_slices < 0) {
    page_slices = ui.getMaxSlicePages() - 1;
  }
  drawInTimeout();
};

let clear = function () {
  ui.clear(g);
};

let minimumDistance = Number.MAX_VALUE;
let lastSearch = 0;
let autosearchCounter = 0;

let updateRouting = function () {
  let s = WIDGETS.gpstrek.getState();
  if (s.mode == MODE_MENU || !s.route || !lib.isValidPosition(s.currentPos)) return;

  let target = lib.get(s.route);
  if (!target) return;
  let currentDistanceToTarget = lib.distance(s.currentPos, target);
  if (!isFinite(currentDistanceToTarget)) return;

  if (currentDistanceToTarget < minimumDistance) {
    minimumDistance = currentDistanceToTarget;
  }
  if (SETTINGS.autosearch && autosearchCounter < SETTINGS.autosearchLimit && !ui.isOverview() && lastSearch + 15000 < Date.now() && minimumDistance < currentDistanceToTarget - SETTINGS.waypointChangeDist) {
    Bangle.buzz(1000);
    lib.setClosestWaypoint(s.route, lib.getWaypointIndex(s.route), null, SETTINGS.maxDistForAutosearch, s.currentPos);
    minimumDistance = Number.MAX_VALUE;
    lastSearch = Date.now();
    autosearchCounter++;
  }
  while (lib.hasNext(s.route)) {
    let nextTarget = lib.get(s.route);
    if (!nextTarget || !(lib.distance(s.currentPos, nextTarget) < SETTINGS.waypointChangeDist)) break;
    lib.next(s.route);
    minimumDistance = Number.MAX_VALUE;
    autosearchCounter = 0;
  }
};

let routingInterval;

let startRouting = function () {
  if (!routingInterval) routingInterval = setInterval(updateRouting, 500);
};

let stopRouting = function () {
  if (routingInterval !== undefined) clearInterval(routingInterval);
  routingInterval = undefined;
};

let switchMode = function (targetMode) {
  switch (targetMode) {
    case MODE_MENU:
      WIDGETS.gpstrek.getState().mode = MODE_MENU;
      switchMenu();
      break;
    case MODE_MAP:
    case MODE_SLICES:
      WIDGETS.gpstrek.getState().mode = targetMode;
      E.showMenu();
      switchNav();
      break;
  }
};

let lastDrawnMode;

let drawMap = function () {
  ui.drawMap(g);
};

let drawSlices = function () {
  ui.drawSlices(g, page_slices, firstDraw);
};

let draw = function () {
  let s = WIDGETS.gpstrek.getState();
  if (s.mode == MODE_MENU) return;

  if (lastDrawnMode != s.mode)
    firstDraw = true;

  if (firstDraw) {
    g.clear();
    Bangle.drawWidgets();
  }

  switch (s.mode) {
    case MODE_MAP:
      drawMap();
      break;
    case MODE_SLICES:
      drawSlices();
      break;
  }

  firstDraw = false;
  lastDrawnMode = s.mode;

  if (scheduleDraw) {
    drawInTimeout();
  }
};

clear();

switchMode(MODE_SLICES);

startRouting();

let onKill = function () {
  stopRouting();
  stopDrawing();
  E.removeListener("kill", onKill);
};

E.on("kill", onKill);
}
