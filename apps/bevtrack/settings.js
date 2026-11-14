(function(back) {
  var FILE = "bevtrack.settings.json";
  var settings = require('bevtrack').loadSettings(FILE, {
    weight: 70,
    gender: "male",
    unit: "metric"
  });

  function writeSettings() {
    require("Storage").writeJSON(FILE, settings);
  }

  var mainmenu = {
    "": {
      "title": "BevTrack Settings"
    },
    "< Back": back,
    "Weight (kg)": {
      value: settings.weight,
      min: 30,
      max: 200,
      onchange: function(v) {
        settings.weight = v;
        writeSettings();
      }
    },
    "Gender": {
      value: settings.gender === "female" ? 1 : 0,
      format: function(v) { return v === 0 ? "Male" : "Female"; },
      min: 0,
      max: 1,
      wrap: true,
      step: 1,
      onchange: function(v) {
        settings.gender = v === 0 ? "male" : "female";
        writeSettings();
      }
    },
    "Units": {
      value: settings.unit === "imperial" ? 1 : 0,
      format: function(v) { return v === 0 ? "Metric" : "Imperial"; },
      min: 0,
      max: 1,
      wrap: true,
      step: 1,
      onchange: function(v) {
        settings.unit = v === 0 ? "metric" : "imperial";
        writeSettings();
      }
    }
  };

  E.showMenu(mainmenu);
})
