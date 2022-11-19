/*
 * 
 * This implements inactivity detection using the van Hees method:
 * 
 * https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0142533
 * 
 * To keep memory requirements smaller, this uses sums instead 
 * of medians of the accelerometer values.
 * 
 */

const AVERAGING_INTERVAL=5000;
const NUMBER_OF_ANGLES=(60000/AVERAGING_INTERVAL)*5;
const MAX_DIFF_ANGLE = 5;

let inactive = undefined;
let startAveraging;
let sumX = 0;
let sumY = 0;
let sumZ = 0;
let angleIndex = 0;
let angles = [];
let averagingInterval = AVERAGING_INTERVAL;
let maxDiffAngle = MAX_DIFF_ANGLE;
let numberOfAngles = NUMBER_OF_ANGLES;
let emit;

function calcAngle(x,y,z){
  return Math.atan(z/Math.sqrt(x*x+y*y)) * 180/Math.PI;
}

function checkMaxDiff(angles, maxdiff){
  let min=Number.POSITIVE_INFINITY,max=Number.NEGATIVE_INFINITY;
  for (let c of angles){
    if (c < min) min = c;
    if (c > max) max = c;
    if (Math.abs(max - min) > maxdiff) return false;
  }
  return true;
}

function onAccel(acc){
  sumX += acc.x;
  sumY += acc.y;
  sumZ += acc.z;
  if ((startAveraging + averagingInterval) < Date.now()){
    startAveraging = Date.now();
    let newAngle = calcAngle(sumX, sumY, sumZ);
    angles.push(newAngle);
    sumX = 0;
    sumY = 0;
    sumZ = 0;
    if (angles.length == numberOfAngles){
      let newInactive = checkMaxDiff(angles,maxDiffAngle);
      if (emit !== undefined && emit && inactive != newInactive){
        E.emit("inactivity_detect", { inactive: newInactive });
      }
      inactive = newInactive;
      angles = [];
    }
  }
}

function startDetection(options){
  if (startAveraging) throw "Already running, mutliple instances not implemented";
  if (options){
    if (options.averagingInterval) averagingInterval = options.averagingInterval;
    if (options.maxDiffAngle) maxDiffAngle = options.maxDiffAngle;
    if (options.numberOfAngles) numberOfAngles = options.numberOfAngles;
    if (options.emitEvents !== undefined) emit = options.emitEvents;
    if (options.startingState !== undefined) inactive = options.startingState;
  }
  startAveraging = Date.now();
  Bangle.on("accel", onAccel);
}

function stopDetection(){
  Bangle.removeListener("accel", onAccel);
}

function isRunning(){
  return startAveraging;
}

function isInactive(){
  return inactive;
}

/*
 * Starts the inactivity-detection.
 * startDetection(options)
 *
 * options={
 *   averagingInterval: optional number,
 *   maxDiffAngle : optional number,
 *   numberOfAngles: optional number,
 *   startingState: optional boolean,
 *   emitEvents: optional boolean
 * }
 *
 * Optionally emits "inactivity_detect" events on the E object whenever the state changes:
 * {
 *   inactive: boolean
 * }
 *
 * The inactivity state changes to true if after numberOfAngles*averagingInterval no angles are
 * further apart than maxDiffAngle.
 *
 * Usage example with faster values for testing:
 *
 * require("inactivity_detect").start({
 *   averagingInterval: 1000,
 *   maxDiffAngle: 5,
 *   numberOfAngles: 5,
 *   emitEvents: true,
 *   startingState = false;
 * });
 * E.on("inactivity_detect",print);
 */
exports.start = startDetection;

/*
 * Stops detection of inactivity and emitting events.
 */
exports.stop = stopDetection;

/*
 * Get current inactivity state.
 * returns:
 *  undefined - if not yet known
 *  true     - inactive
 *  false    - active
 */
exports.isInactive = isInactive;

/*
 * Get current detection state.
 */
exports.isRunning = isRunning;
