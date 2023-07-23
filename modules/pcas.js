const PCAS="$PCAS";
const PCAS_UPDATE_RATE="02";
const PCAS_SENTENCE_OUTPUT="03";
const PCAS_NMEA_VERSION="05";
const PCAS_REBOOT="10";
const PCAS_DYNAMIC_MODEL="11";
const PCAS_STANDBY="12";

const NMEA_VERSION_MAP = {
  "4.1": "2",
  "4.0": "5",
  "2.2": "9",
};

const REBOOT={
  "hot": "0",
  "cold": "1",
  "warm": "2",
  "factory": "3",
};

const MODEL={
  "portable": "0",
  "stationary": "1",
  "pedestrian": "2",
  "automotive": "3",
  "sea": "4",
  "airborne<1G": "5",
  "airborne<2G": "6",
  "airborne<4G": "7"
};

const SENTENCE_POSITION={
  "GGA": "0",
  "GLL": "1",
  "GSA": "2",
  "GSV": "3",
  "RMC": "4",
  "VTG": "5",
  "ZDA": "6",
  "ANT": "7",
  "DHV": "8",
  "LPS": "9",
  "UTC": "12",
  "GST": "13"
};

const NMEA_UPDATE_RATES = ["100","200","250","500","1000"];

let cleanupTimeout;

function sendCommand(command, value){
  Bangle.setGPSPower(1,"gpsconf");

  if (value === undefined)
    throw "No value given";

  Serial1.println(checksum(PCAS + command + "," + value));

  if (cleanupTimeout) clearTimeout(cleanupTimeout);
  cleanupTimeout = setTimeout(()=>{
    Bangle.setGPSPower(0,"gpsconf");
    cleanupTimeout = undefined;
  }, 1000);
}

function checksum(cmd) {
  var cs = 0;
  for (var i = 1; i < cmd.length; i++)
    cs = cs ^ cmd.charCodeAt(i);
  return cmd + "*" + cs.toString(16).toUpperCase().padStart(2, '0');
}

function arrayBasedCommand(command, possibleValues, value){
  if (possibleValues.includes(value+""))
    sendCommand(command, value);
  else
    throw "Invalid value \"" + value + "\" expected one of:" + possibleValues.join(",");
}

function mapBasedCommand(command, valueMap, value){
  let keys = Object.keys(valueMap);
  if (keys.includes(value+"")){
    sendCommand(command, valueMap[value]);
  }
  else
    throw "Invalid value \"" + value + "\" expected one of:" + keys.join(",");
}

function setUpdateInterval(interval) {
  arrayBasedCommand(PCAS_UPDATE_RATE, NMEA_UPDATE_RATES, interval);
}

function setNMEA(version) {
  mapBasedCommand(PCAS_NMEA_VERSION, NMEA_VERSION_MAP, version);
}

function reboot(type){
  mapBasedCommand(PCAS_REBOOT, REBOOT, type);
}

function setDynamicModel(model){
  mapBasedCommand(PCAS_DYNAMIC_MODEL, MODEL, type);
}

function setStandby(seconds){
  sendCommand(PCAS_STANDBY, seconds);
}

function setSentenceOutput(type, value){
  let types = Object.keys(SENTENCE_POSITION);
  if (!types.includes(type))
    throw "Invalid type \"" + type + "\" expected one of:" + types.join(",");
  if (value < 0 || value >= 10)
    throw "Invalid value, expected number between 0 and 10";
  let flags = new Array(types.length);
  flags[SENTENCE_POSITION[type]] = value;
  sendCommand(PCAS_SENTENCE_OUTPUT, flags.join(","));
}

exports.sendCommand = sendCommand;
exports.checksum = checksum;
exports.setUpdateInterval = setUpdateInterval;
exports.setNMEA = setNMEA;
exports.reboot = reboot;
exports.setDynamicModel = setDynamicModel;
exports.setStandby = setStandby;
exports.setSentenceOutput = setSentenceOutput;