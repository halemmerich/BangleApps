/**
 * GPS Trekking UI library.
 *
 * Everything in this module draws to a Graphics instance. The app supplies
 * the current widget state, so the UI stays independent from the app's
 * event handling and from the global WIDGETS object.
 */
const loc = require("locale");
const graphicsUtils = require("graphics_utils");
const lib = require("gpstrek.lib.js");

const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const arrow = Graphics.createImage(`
     X
    XXX
   XXXXX
  XXX XXX
 XXX   XXX
XXX     XXX
`);

const thinarrow = Graphics.createImage(`
    X
   XXX
  XX XX
 XX   XX
XX     XX
`);

const cross = Graphics.createImage(`
XX       XX
 XX     XX
  XX   XX
   XX XX
    XXX
   XX XX
  XX   XX
 XX     XX
XX       XX
`);

const move = Graphics.createImage(`
      X
     XXX
    X X X
      X
      X
  X   X   X
 X    X    X
XXXXXXXXXXXXX
 X    X    X
  X   X   X
      X
      X
    X X X
     XXX
      X
`);

const point = Graphics.createImage(`
   XX
  XXXX
 XX  XX
XX    XX
XX    XX
 XX  XX
  XXXX
   XX
`);

const finishIcon = atob("CggB//meZmeZ+Z5n/w==");

function matchFontSize(graphics, text, height, width) {
  graphics.setFontVector(height);
  let size = 1;
  while (graphics.stringMetrics(text).width > 0.90 * width) {
    size -= 0.05;
    graphics.setFont("Vector", Math.floor(height * size));
  }
}

function triangle(x, y, width, height) {
  return [
    Math.round(x), Math.round(y),
    Math.round(x + width * 0.5), Math.round(y + height),
    Math.round(x - width * 0.5), Math.round(y + height)
  ];
}

exports.create = function (options) {
  const settings = options.settings || lib.readSettings();
  const getState = options.getState;
  const batFullVoltage = options.batFullVoltage || 0.3144;
  const defaultScreenWidth = options.screenWidth || g.getWidth();
  const defaultScreenHeight = options.screenHeight || g.getHeight();

  let isMapOverview = false;
  let forceMapRedraw = false;
  let scrolling = false;
  let mapOverviewX = defaultScreenWidth / 2;
  let mapOverviewY = defaultScreenHeight / 2;
  let mapOverviewScale = settings.overviewScale;
  let mapLiveScale = settings.mapScale;

  let activeTimeouts = [];
  let taskQueue = [];
  let queueProcessing = false;

  function isGpsCourse() {
    let s = getState();
    return s.currentPos && isFinite(s.currentPos.course);
  }

  function getAveragedCompass() {
    return Math.round(getState().avgComp);
  }

  function addToTaskQueue(func, data) {
    if (queueProcessing) print("Adding during processing, this should not happen");
    taskQueue.push({ f: func, d: data });
  }

  function prependTaskQueue(func, data, force) {
    if (queueProcessing && !force) print("Prepending during processing, this should not happen");
    taskQueue.unshift({ f: func, d: data });
  }

  function runQueue(inTimeouts) {
    if (taskQueue.length > 0) {
      let current = taskQueue.shift();
      if (inTimeouts) {
        let id = setTimeout(() => {
          current.f(current.d);
          activeTimeouts = activeTimeouts.filter((c) => c != id);
          runQueue(inTimeouts);
        }, settings.queueWaitingTime);
        activeTimeouts.push(id);
      } else {
        current.f(current.d);
        runQueue(inTimeouts);
      }
    }
  }

  function processTaskQueue(inTimeouts) {
    if (queueProcessing) return;
    addToTaskQueue(() => { queueProcessing = false; });
    queueProcessing = true;
    runQueue(inTimeouts);
  }

  function cancelTasks() {
    taskQueue = [];
    for (let c of activeTimeouts) {
      clearTimeout(c);
    }
    activeTimeouts = [];
    queueProcessing = false;
  }

  function getDoubleLineSlice(title1, title2, provider1, provider2) {
    return {
      draw: function (graphics, x, y, height, width) {
        if (typeof title1 == "function") title1 = title1();
        if (typeof title2 == "function") title2 = title2();
        graphics.clearRect(x, y, x + width, y + height);

        let lastValue1 = provider1();
        matchFontSize(graphics, title1 + lastValue1, Math.floor(height * 0.5), width);
        graphics.setFontAlign(-1, -1);
        graphics.drawString(title1, x + 2, y);
        graphics.setFontAlign(1, -1);
        graphics.drawString(lastValue1, x + width, y);

        let lastValue2 = provider2();
        matchFontSize(graphics, title2 + lastValue2, Math.floor(height * 0.5), width);
        graphics.setFontAlign(-1, -1);
        graphics.drawString(title2, x + 2, y + (height * 0.5));
        graphics.setFontAlign(1, -1);
        graphics.drawString(lastValue2, x + width, y + (height * 0.5));
      }
    };
  }

  function getMapSlice() {
    let lastDrawn = 0;
    let lastCourse = 0;
    let lastStart;
    let lastCurrent;
    return {
      draw: function (graphics, x, y, height, width) {
        let s = getState();

        let course = 0;
        if (isGpsCourse())
          course = s.currentPos.course;
        else
          course = getAveragedCompass();

        let route = s.route;
        if (!route) return;
        let waypoint = lib.get(route);
        let currentRouteIndex = lib.getWaypointIndex(route);
        let startingPoint = Bangle.project(waypoint);
        let current = startingPoint;
        let currentPosFromGPS = false;
        if (s.currentPos.lat) {
          current = Bangle.project(s.currentPos);
          currentPosFromGPS = true;
        } else {
          // in case of no actual position assume previous waypoint as current
          let prevPoint = lib.getPrev(route, currentRouteIndex);
          if (prevPoint && prevPoint.lat) current = Bangle.project(prevPoint);
        }

        const interfaceHeight = graphics.getHeight() * 0.1;
        const errorMarkerSize = 3;
        let compassHeight = height * 0.4;
        if (!settings.mapCompass) compassHeight = 0;
        if (compassHeight > graphics.getHeight() * 0.1) compassHeight = graphics.getHeight() * 0.1;
        let compassCenterX = x + errorMarkerSize + 8 + compassHeight;
        let compassCenterY = y + errorMarkerSize + 8 + compassHeight;
        let mapCenterX = isMapOverview ? mapOverviewX : x + (width - 10) / 2 + compassHeight + 5;
        let mapCenterY = isMapOverview ? mapOverviewY : y + height * 0.4;
        let mapScale = isMapOverview ? mapOverviewScale : mapLiveScale;
        let mapRot = graphicsUtils.degreesToRadians(180 - (isMapOverview ? 0 : course));
        let mapTrans = {
          scale: mapScale,
          rotate: mapRot,
          x: mapCenterX,
          y: mapCenterY
        };

        let drawInterface = function () {
          graphics.setClipRect(x, y, x + width, y + height);
          graphics.setFont("Vector", 25).setFontAlign(0, 0);
          graphics.setColor(graphics.theme.fg);
          graphics.clearRect(x, y + height - interfaceHeight, x + width, y + height - 1);

          graphics.drawRect(x, y + height - interfaceHeight, x + width / 4, y + height - 1);
          graphics.drawString("-", x + width * 0.125, y + height - interfaceHeight * 0.5);

          graphics.drawRect(x + width * 0.75, y + height - interfaceHeight, x + width - 1, y + height - 1);
          graphics.drawString("+", x + width * 0.875, y + height - interfaceHeight * 0.5);

          let refs = [10, 20, 50, 100, 200, 300, 400, 500, 800, 1000, 2000, 5000, 10000, 50000];
          let l = width * 0.4;
          let scale = refs[0];
          for (let c of refs) {
            if (c * mapScale > l)
              break;
            else
              scale = c;
          }
          let scaleString = loc.distance(scale, 2);

          let scaleHeight = interfaceHeight * 0.2;
          graphics.setFontAlign(-1, -1).setFont("Vector", 12);
          graphics.drawString(scaleString, x + width * 0.31, y + height - interfaceHeight, true);
          if (isFinite(scale)) {
            graphics.drawLine(x + width * 0.3, y + height - scaleHeight, x + width * 0.3 + scale * mapScale, y + height - scaleHeight);
            graphics.drawLine(x + width * 0.3, y + height - scaleHeight, x + width * 0.3, y + height - interfaceHeight);
            graphics.drawLine(x + width * 0.3 + scale * mapScale, y + height - scaleHeight, x + width * 0.3 + scale * mapScale, y + height - interfaceHeight);
          }
        };

        let drawMapCompass = function () {
          graphics.setClipRect(x, y, x + width, y + height - interfaceHeight - 1);
          graphics.setFont6x15();
          let compass = [0, 0, 0, compassHeight, 0, -compassHeight, compassHeight, 0, -compassHeight, 0];
          compass = graphics.transformVertices(compass, {
            rotate: graphicsUtils.degreesToRadians(180 - course),
            x: compassCenterX,
            y: compassCenterY
          });
          graphics.setFontAlign(0, 0);
          graphics.setColor(graphics.theme.bg);
          graphics.fillCircle(compassCenterX, compassCenterY, compassHeight + 7);
          graphics.setColor(graphics.theme.fg);
          graphics.drawCircle(compassCenterX, compassCenterY, compassHeight);
          graphics.drawString("N", compass[2], compass[3], true);
          graphics.drawString("S", compass[4], compass[5], true);
          graphics.drawString("W", compass[6], compass[7], true);
          graphics.drawString("E", compass[8], compass[9], true);

          if (!isGpsCourse() && !isMapOverview) {
            let xh = E.clip(s.acc.x * compassHeight, -compassHeight, compassHeight);
            let yh = E.clip(s.acc.y * compassHeight, -compassHeight, compassHeight);
            graphics.fillCircle(compassCenterX + xh, compassCenterY + yh, 3);
          } else if (isMapOverview) {
            graphics.setColor(0, 0, 1);
            graphics.fillCircle(compassCenterX, compassCenterY, 3);
          }
        };

        let drawCurrentPos = function () {
          graphics.setClipRect(x, y, x + width, y + height - interfaceHeight - 1);
          graphics.setColor(graphics.theme.fg);

          if (currentPosFromGPS) {
            let pos = graphics.transformVertices([startingPoint.x - current.x, (startingPoint.y - current.y) * -1], mapTrans);

            if (!isMapOverview) {
              if (pos[0] < x) { pos[0] = x + errorMarkerSize + 5; graphics.setColor(1, 0, 0).fillRect(x, y, x + errorMarkerSize, y + height); }
              if (pos[0] > x + width) { pos[0] = x + width - errorMarkerSize - 5; graphics.setColor(1, 0, 0).fillRect(x + width - errorMarkerSize, y, x + width, y + height); }
              if (pos[1] < y) { pos[1] = y + errorMarkerSize + 1; graphics.setColor(1, 0, 0).fillRect(x, y, x + width, y + errorMarkerSize); }
              if (pos[1] > y + height - interfaceHeight - 1) { pos[1] = y + height - errorMarkerSize - 5 - interfaceHeight - 1; graphics.setColor(1, 0, 0).fillRect(x, y + height - errorMarkerSize - interfaceHeight - 1, x + width, y + height - interfaceHeight - 1); }
            }

            if (isMapOverview) {
              graphics.drawImage(arrow, pos[0], pos[1], { rotate: graphicsUtils.degreesToRadians(course) });
            } else {
              graphics.drawImage(arrow, pos[0] - arrow.width / 2, pos[1]);
            }
            graphics.setColor(0, 1, 0);
            graphics.fillRect(mapCenterX - 1, mapCenterY - 1, mapCenterX + 1, mapCenterY + 1);
            graphics.drawCircle(mapCenterX, mapCenterY, mapScale * settings.waypointChangeDist);
            graphics.setColor(graphics.theme.fg);
          } else {
            graphics.setColor(0, 1, 0);
            graphics.fillCircle(mapCenterX, mapCenterY, 5);
            graphics.setColor(graphics.theme.fg);
          }
        };

        let courseChanged = Math.abs(lastCourse - course) > settings.minCourseChange;
        let oldEnough = Date.now() - lastDrawn > settings.mapRefresh;
        let startChanged = (!lastStart || lastStart.x != startingPoint.x || lastStart.y != startingPoint.y);
        let neededChange = (settings.minPosChange / (isMapOverview ? mapOverviewScale : mapLiveScale));
        let currentChanged = (!lastCurrent || (Math.abs(lastCurrent.x - current.x)) > neededChange || (Math.abs(lastCurrent.y - current.y)) > neededChange);
        let liveChanged = !isMapOverview && (startChanged || currentChanged || courseChanged);
        let refreshMap = forceMapRedraw || (oldEnough && (liveChanged));

        let renderInTimeouts = isMapOverview || !Bangle.isLocked();
        if (refreshMap) {
          cancelTasks();

          // clear map view
          graphics.clearRect(x, y, x + width, y + height - interfaceHeight - 1);

          if (isMapOverview && scrolling) {
            addToTaskQueue(() => {
              graphics.setColor(graphics.theme.fg);
              graphics.drawImage(move, compassCenterX - compassHeight, compassCenterY - compassHeight);
            });
          }

          if (!isMapOverview) {
            drawCurrentPos();
          }
          if (settings.mapCompass && !isMapOverview && renderInTimeouts) {
            drawMapCompass();
          }
          if (renderInTimeouts) drawInterface();

          forceMapRedraw = false;
          lastDrawn = Date.now();

          let drawPath = function (reverse, startingIndex, maxWaypoints) {
            let data = {
              i: startingIndex,
              poly: [],
              maxWaypoints: maxWaypoints,
              breakLoop: false,
              dist: 0
            };

            let drawChunk = function (data) {
              if (data.breakLoop) return;
              graphics.setColor(graphics.theme.fg);
              graphics.setClipRect(x, y, x + width, y + height - interfaceHeight - 1);
              let finish;
              let last;
              let toDraw;
              let named = [];
              let dir = [];
              for (let j = 0; j < settings.mapChunkSize; j++) {
                data.i = data.i + (reverse ? -1 : 1);
                let p = lib.get(route, data.i);
                if (!p || !p.lat) {
                  data.i = data.i + (reverse ? 1 : -1);
                  data.breakLoop = true;
                  break;
                }
                if (data.maxWaypoints && Math.abs(startingIndex - data.i) > data.maxWaypoints) {
                  data.breakLoop = true;
                  last = true;
                  break;
                }
                toDraw = Bangle.project(p);

                if (settings.mapDirection) {
                  let lastWp = lib.get(route, data.i - (reverse ? -1 : 1));
                  if (lastWp) data.dist += lib.distance(lastWp, p);
                  if (!isMapOverview && data.dist > 20 / mapScale) {
                    dir.push({ i: data.poly.length, b: graphicsUtils.degreesToRadians(lib.bearing(lastWp, p) - (reverse ? 0 : 180)) });
                    data.dist = 0;
                  }
                }
                if (p.name)
                  named.push({ i: data.poly.length, n: p.name });
                data.poly.push(startingPoint.x - toDraw.x);
                data.poly.push((startingPoint.y - toDraw.y) * -1);
              }
              finish = lib.isLast(route, lib.getWaypointIndex(route, data.i));

              data.poly = graphics.transformVertices(data.poly, mapTrans);
              graphics.drawPoly(data.poly, false);

              if (!isMapOverview && (data.poly[data.poly.length - 2] < (x - 10)
                || data.poly[data.poly.length - 2] > (x + width + 10)
                || data.poly[data.poly.length - 1] < (y - 10)
                || data.poly[data.poly.length - 1] > (y + height + 10))) data.breakLoop = true;

              graphics.setFont6x15().setFontAlign(-1, 0);
              for (let c of named) {
                if (data.i != 0 || currentPosFromGPS) {
                  graphics.drawImage(point, Math.round(data.poly[c.i] - point.width / 2), Math.round(data.poly[c.i + 1] - point.height / 2));
                }
                graphics.drawString(c.n, data.poly[c.i] + 10, data.poly[c.i + 1]);
              }

              for (let c of dir) {
                graphics.drawImage(thinarrow, data.poly[c.i], data.poly[c.i + 1], { rotate: c.b });
              }

              if (finish)
                graphics.drawImage(finishIcon, data.poly[data.poly.length - 2] - 5, data.poly[data.poly.length - 1] - 4);
              else if (last) {
                graphics.drawImage(cross, data.poly[data.poly.length - 2] - cross.width / 2, data.poly[data.poly.length - 1] - cross.height / 2);
              }

              // Add last drawn point to get closed path
              if (toDraw) {
                data.poly = [startingPoint.x - toDraw.x, (startingPoint.y - toDraw.y) * -1];
                toDraw = null;
              }

              if (!data.breakLoop) {
                prependTaskQueue(drawChunk, data, true);
              }
            };
            addToTaskQueue(drawChunk, data);
          };

          drawPath(true, currentRouteIndex + 1);
          drawPath(false, currentRouteIndex - 1);

          addToTaskQueue(drawInterface);
          addToTaskQueue(drawCurrentPos);

          addToTaskQueue(() => {
            lastCourse = course;
            lastStart = startingPoint;
            lastCurrent = current;
          });
          processTaskQueue(renderInTimeouts);
        }
        if (settings.mapCompass && !isMapOverview) {
          drawMapCompass();
        }
      }
    };
  }

  function getTargetSlice(targetDataSource) {
    let nameIndex = 0;
    return {
      draw: function (graphics, x, y, height, width) {
        graphics.clearRect(x, y, x + width, y + height);
        if (targetDataSource.icon) {
          graphics.drawImage(targetDataSource.icon, x, y + (height - 16) / 2);
          x += 16;
          width -= 16;
        }

        let start = targetDataSource.getStart();
        let target = targetDataSource.getTarget();

        if (!target || !start) return;

        let dist = lib.distance(start, target);
        if (isNaN(dist)) dist = Infinity;
        let bearingString = lib.bearing(start, target) + "°";
        if (target.name) {
          graphics.setFont("Vector", Math.floor(height * 0.5));
          let scrolledName = (target.name || "").substring(nameIndex);
          if (graphics.stringMetrics(scrolledName).width > width) {
            nameIndex++;
          } else {
            nameIndex = 0;
          }
          graphics.drawString(scrolledName, x + 2, y);

          let distanceString = loc.distance(dist, 2);
          matchFontSize(graphics, distanceString + bearingString, height * 0.5, width);
          graphics.drawString(bearingString, x + 2, y + (height * 0.5));
          graphics.setFontAlign(1, -1);
          graphics.drawString(distanceString, x + width, y + (height * 0.5));
        } else {
          graphics.setFont("Vector", Math.floor(height * 1));
          let formattedDist = loc.distance(dist, 2);
          let distNum = (formattedDist.match(/[0-9\.]+/) || [Infinity])[0];

          matchFontSize(graphics, bearingString + distNum, height * 0.8, width);
          graphics.setFontAlign(-1, -1);
          graphics.drawString(bearingString, x + 2, y);
          graphics.setFontAlign(1, -1);
          graphics.drawString(distNum, x + width, y);
          graphics.setFont("Vector", Math.floor(height * 0.25));

          graphics.setFontAlign(-1, 1);
          if (targetDataSource.getProgress) {
            graphics.drawString(targetDataSource.getProgress(), x + 2, y + height);
          }
          graphics.setFontAlign(1, 1);
          if (isFinite(distNum) && distNum != Infinity)
            graphics.drawString(formattedDist.match(/[a-zA-Z]+/), x + width, y + height);
        }
      }
    };
  }

  function drawCompass(graphics, x, y, height, width, increment, start) {
    graphics.setFont12x20();
    graphics.setFontAlign(0, -1);
    graphics.setColor(graphics.theme.fg);
    let frag = 0 - start % 15;
    if (frag > 0) frag = 0;
    let xpos = 0 + frag * increment;
    for (let i = start; i <= 720; i += 15) {
      let res = i + frag;
      if (res % 90 == 0) {
        graphics.drawString(labels[Math.floor(res / 45) % 8], xpos, y + height * 0.1);
        graphics.fillRect(xpos - 1, Math.floor(y + height * 0.8), xpos + 1, Math.floor(y + height));
      } else if (res % 45 == 0) {
        graphics.drawString(labels[Math.floor(res / 45) % 8], xpos, y + height * 0.1);
        graphics.fillRect(xpos - 1, Math.floor(y + height * 0.7), xpos + 1, Math.floor(y + height));
      } else if (res % 15 == 0) {
        graphics.fillRect(xpos, Math.floor(y + height * 0.9), xpos + 1, Math.floor(y + height));
      }
      xpos += increment * 15;
      if (xpos > width + 20) break;
    }
  }

  function getCompassSlice() {
    let compassDataSource = {
      getCourse: function () {
        if (isGpsCourse()) return getState().currentPos.course;
        return getAveragedCompass();
      },
      getPoints: function () {
        let points = [];
        let s = getState();
        if (s.currentPos && s.currentPos.lon && s.route) {
          points.push({ bearing: lib.bearing(s.currentPos, lib.getLast(s.route)), icon: finishIcon });
        }
        if (s.currentPos && s.currentPos.lon && s.waypoint) {
          points.push({ bearing: lib.bearing(s.currentPos, s.waypoint), icon: finishIcon });
        }
        if (s.currentPos && s.currentPos.lon && s.route) {
          points.push({ bearing: lib.bearing(s.currentPos, lib.get(s.route)), color: "#0f0" });
        }
        return points;
      },
      getMarkers: function (graphics) {
        return [{ xpos: 0.5, width: 10, height: 10, linecolor: graphics.theme.fg, fillcolor: "#f00" }];
      }
    };
    let lastDrawnValue = 0;

    return {
      refresh: function () {
        return Math.abs(lastDrawnValue - compassDataSource.getCourse()) > settings.minCourseChange;
      },
      draw: function (graphics, x, y, height, width) {
        const max = 180;
        const increment = width / max;

        let s = getState();

        let course = isGpsCourse() ? s.currentPos.course : getAveragedCompass();

        lastDrawnValue = course;

        graphics.clearRect(x, y, x + width, y + height);

        let start = course - 90;
        if (isNaN(course)) start = -90;
        if (start < 0) start += 360;
        start = start % 360;

        if (s.acc && !isGpsCourse()) {
          drawCompass(graphics, 0, y + width * 0.05, height - width * 0.05, width, increment, start);
        } else {
          drawCompass(graphics, 0, y, height, width, increment, start);
        }

        if (compassDataSource.getPoints) {
          let points = compassDataSource.getPoints();
          for (let p of points) {
            graphics.reset();
            let bpos = p.bearing - course;
            if (bpos > 180) bpos -= 360;
            if (bpos < -180) bpos += 360;
            bpos += 120;
            let min = 0;
            let max = 180;
            if (bpos <= min) {
              bpos = Math.floor(width * 0.05);
            } else if (bpos >= max) {
              bpos = Math.ceil(width * 0.95);
            } else {
              bpos = Math.round(bpos * increment);
            }
            if (p.color) {
              graphics.setColor(p.color);
            }
            if (p.icon) {
              graphics.drawImage(p.icon, bpos, y + height - 12, { rotate: 0, scale: 2 });
            } else {
              graphics.fillCircle(bpos, y + height - 12, Math.floor(width * 0.03));
            }
          }
        }
        if (compassDataSource.getMarkers) {
          let markers = compassDataSource.getMarkers(graphics);
          for (let m of markers) {
            graphics.reset();
            graphics.setColor(m.fillcolor);
            let mpos = m.xpos * width;
            if (m.xpos < 0.05) mpos = Math.floor(width * 0.05);
            if (m.xpos > 0.95) mpos = Math.ceil(width * 0.95);
            graphics.fillPoly(triangle(mpos, y + height - m.height, m.height, m.width));
            graphics.setColor(m.linecolor);
            graphics.drawPoly(triangle(mpos, y + height - m.height, m.height, m.width), true);
          }
        }
        graphics.setColor(graphics.theme.fg);
        graphics.fillRect(x, y, Math.floor(width * 0.05), y + height);
        graphics.fillRect(Math.ceil(width * 0.95), y, width, y + height);
        if (s.acc && !isGpsCourse()) {
          let xh = E.clip(width * 0.5 - height / 2 + (((s.acc.x + 1) / 2) * height), width * 0.5 - height / 2, width * 0.5 + height / 2);
          let yh = E.clip(y + (((s.acc.y + 1) / 2) * height), y, y + height);

          graphics.fillRect(width * 0.5 - height / 2, y, width * 0.5 + height / 2, y + Math.floor(width * 0.05));

          graphics.setColor(graphics.theme.bg);
          graphics.drawLine(width * 0.5 - 5, y, width * 0.5 - 5, y + Math.floor(width * 0.05));
          graphics.drawLine(width * 0.5 + 5, y, width * 0.5 + 5, y + Math.floor(width * 0.05));
          graphics.fillRect(xh - 1, y, xh + 1, y + Math.floor(width * 0.05));

          let left = Math.floor(width * 0.05);
          let right = Math.ceil(width * 0.95);
          graphics.drawLine(0, y + height / 2 - 5, left, y + height / 2 - 5);
          graphics.drawLine(right, y + height / 2 - 5, x + width, y + height / 2 - 5);
          graphics.drawLine(0, y + height / 2 + 5, left, y + height / 2 + 5);
          graphics.drawLine(right, y + height / 2 + 5, x + width, y + height / 2 + 5);
          graphics.fillRect(0, yh - 1, left, yh + 1);
          graphics.fillRect(right, yh - 1, x + width, yh + 1);
        }
        graphics.setColor(graphics.theme.fg);
        graphics.drawRect(Math.floor(width * 0.05), y, Math.ceil(width * 0.95), y + height);
      }
    };
  }

  const waypointData = {
    icon: atob("EBCBAAAAAAAAAAAAcIB+zg/uAe4AwACAAAAAAAAAAAAAAAAA"),
    getProgress: function () {
      return (lib.getWaypointIndex(getState().route) + 1) + "/" + lib.getRouteIndex(getState().route).length;
    },
    getTarget: function () {
      return lib.get(getState().route);
    },
    getStart: function () {
      return getState().currentPos;
    }
  };

  const finishData = {
    icon: atob("EBABAAA/4DmgJmAmYDmgOaAmYD/gMAAwADAAMAAwAAAAAAA="),
    getTarget: function () {
      let s = getState();
      if (s.route) return lib.getLast(s.route);
      if (s.waypoint) return s.waypoint;
    },
    getStart: function () {
      return getState().currentPos;
    }
  };

  const compassSlice = getCompassSlice();
  const mapSlice = getMapSlice();
  const waypointSlice = getTargetSlice(waypointData);
  const finishSlice = getTargetSlice(finishData);
  const eleSlice = getDoubleLineSlice("Up", "Down", () => {
    let s = getState();
    return loc.distance(s.up, 3) + "/" + (s.route ? loc.distance(s.route.up, 3) : "---");
  }, () => {
    let s = getState();
    return loc.distance(s.down, 3) + "/" + (s.route ? loc.distance(s.route.down, 3) : "---");
  });

  const statusSlice = getDoubleLineSlice("Speed", "Alt", () => {
    let speed = 0;
    let s = getState();
    if (s.currentPos && s.currentPos.speed) speed = s.currentPos.speed;
    return loc.speed(speed, 2);
  }, () => {
    let alt = Infinity;
    let s = getState();
    if (isFinite(s.altitude)) {
      alt = isNaN(s.calibAltDiff) ? s.altitude : (s.altitude - s.calibAltDiff);
    }
    if (s.currentPos && s.currentPos.alt) alt = s.currentPos.alt;
    if (isNaN(alt)) return "---";
    return loc.distance(alt, 3);
  });

  const status2Slice = getDoubleLineSlice("Compass", "GPS", () => {
    return getAveragedCompass() + "°";
  }, () => {
    let course = "---°";
    let s = getState();
    if (s.currentPos && s.currentPos.course) course = s.currentPos.course.toFixed(0) + "°";
    return course;
  });

  const healthSlice = getDoubleLineSlice("Heart", "Steps", () => {
    return getState().bpm || "---";
  }, () => {
    return isFinite(getState().steps) ? getState().steps : "---";
  });

  const system2Slice = getDoubleLineSlice("Bat", "Storage", () => {
    return (Bangle.isCharging() ? "+" : "") + E.getBattery().toFixed(0) + "% " + (analogRead(D3) * 4.2 / batFullVoltage).toFixed(2) + "V";
  }, () => {
    return (require("Storage").getFree() / 1024).toFixed(0) + "kB";
  });

  const systemSlice = getDoubleLineSlice("RAM", "WP Cache", () => {
    let ram = process.memory(false);
    return ((ram.blocksize * ram.free) / 1024).toFixed(0) + "kB";
  }, () => {
    return lib.getCacheSize() ? lib.getCacheSize() : 0;
  });

  let slices = [];
  let maxSlicePages = 1;
  let lastDrawnPage;

  function updateSlices() {
    let s = getState();
    slices = [compassSlice];
    if (s.currentPos && s.currentPos.lat && s.route && !lib.isLast(s.route)) {
      slices.push(waypointSlice);
    }
    if (s.currentPos && s.currentPos.lat && (s.route || s.waypoint)) {
      slices.push(finishSlice);
    }
    slices.push(eleSlice);
    slices.push(statusSlice);
    slices.push(status2Slice);
    slices.push(healthSlice);
    slices.push(systemSlice);
    slices.push(system2Slice);
    maxSlicePages = Math.ceil(slices.length / settings.numberOfSlices);
  }

  function getSliceHeight() {
    return Math.floor(Bangle.appRect.h / settings.numberOfSlices);
  }

  function clear(graphics) {
    graphics.clearRect(Bangle.appRect);
  }

  function drawMap(graphics) {
    graphics.reset();
    mapSlice.draw(graphics, Bangle.appRect.x, Bangle.appRect.y, Bangle.appRect.h, Bangle.appRect.w);
  }

  function drawSlices(graphics, page, firstDraw) {
    updateSlices();
    let ypos = Bangle.appRect.y;
    let force = lastDrawnPage != page || firstDraw;
    if (force) {
      clear(graphics);
    }
    let firstSlice = page * settings.numberOfSlices;
    let sliceHeight = getSliceHeight();
    let slicesToDraw = slices.slice(firstSlice, firstSlice + settings.numberOfSlices);
    for (let slice of slicesToDraw) {
      graphics.reset();
      if (!slice.refresh || slice.refresh() || force)
        slice.draw(graphics, 0, ypos, sliceHeight, graphics.getWidth());
      ypos += sliceHeight + 1;
      graphics.drawLine(0, ypos - 1, graphics.getWidth(), ypos - 1);
    }
    lastDrawnPage = page;
  }

  function forceRedraw() {
    forceMapRedraw = true;
  }

  function toggleOverview() {
    isMapOverview = !isMapOverview;
    if (!isMapOverview) {
      mapOverviewX = defaultScreenWidth / 2;
      mapOverviewY = defaultScreenHeight / 2;
      scrolling = false;
    }
  }

  function isOverview() {
    return isMapOverview;
  }

  function isScrolling() {
    return scrolling;
  }

  function toggleScrolling() {
    scrolling = !scrolling;
  }

  function scrollOverview(dx, dy) {
    mapOverviewX += dx * settings.overviewScroll;
    mapOverviewY += dy * settings.overviewScroll;
  }

  function zoom(direction) {
    if (isMapOverview) {
      mapOverviewScale *= direction > 0 ? 1.33 : 1 / 1.33;
    } else {
      mapLiveScale *= direction > 0 ? 1.33 : 1 / 1.33;
    }
  }

  return {
    drawMap: drawMap,
    drawSlices: drawSlices,
    clear: clear,
    getSliceHeight: getSliceHeight,
    getMaxSlicePages: function () { return maxSlicePages; },
    cancelTasks: cancelTasks,
    forceRedraw: forceRedraw,
    toggleOverview: toggleOverview,
    isOverview: isOverview,
    isScrolling: isScrolling,
    toggleScrolling: toggleScrolling,
    scrollOverview: scrollOverview,
    zoom: zoom
  };
};
