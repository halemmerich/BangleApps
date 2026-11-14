// SwipeUI Library - UI functions for bevtrack app
// Version: 0.0.1

let SWIPEUI_VERSION = "0.0.1";

// Display state tracking
let display = null;
let currentScreen = 0;
let selectedDrink = 'coffee';
let entries = [];
let settings = {
    weight: 70,
    gender: 'male',
    dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
    }
};

// Load entries from storage
function loadEntries() {
    entries = require('bevtrack').getRecentEntries(
        require('bevtrack').loadEntries('bevtrack_entries.dat')
    );
}

// Load settings
function loadSettings() {
    settings = require('bevtrack').loadSettings('bevtrack.settings.json', settings);
}

// Get settings getter
function getSettings() {
    return settings;
}

// Load all data
function loadData() {
    loadEntries();
    loadSettings();
}

// ===== SCREEN 0: DRINK SELECTION =====

// Draw drink selection screen
function drawDrinkSelectionScreen() {
    g.clear();
    drawDrinkIcons();
    drawDrinkSelectionText();
    drawBackButton();
    drawBACValue();
}

// Draw all drink icons
function drawDrinkIcons() {
    const drinks = [
        { key: 'coffee', icon: 0x0000, x: 0, y: 0 },
        { key: 'tea', icon: 0x03E0, x: 32, y: 0 },
        { key: 'beer', icon: 0x001F, x: 64, y: 0 },
        { key: 'wine', icon: 0xF81F, x: 96, y: 0 },
        { key: 'shot', icon: 0xFF00, x: 128, y: 0 },
        { key: 'energy', icon: 0x07E0, x: 160, y: 0 },
        { key: 'cola', icon: 0x7800, x: 0, y: 16 },
        { key: 'custom', icon: 0xFFFF, x: 32, y: 16 }
    ];
    
    for (let i = 0; i < drinks.length; i++) {
        let d = drinks[i];
        g.setColor(d.icon);
        g.fillRect(d.x, d.y, 8, 8);
    }
}

// Draw drink selection text
function drawDrinkSelectionText() {
    let index = getDrinkIndex(selectedDrink);
    g.setFont("6x8");
    g.setColor(0xFFFF);
    
    if (index >= 0) {
        let label = getDrinkName(selectedDrink);
        if (selectedDrink === 'custom') {
            label = "Custom";
        }
        let x = 12;
        let y = 24;
        let w = 60;
        let h = 12;
        g.fillRect(x, y, w, h);
        g.setColor(0x0000);
        g.drawString(label, x, y, "right");
    }
}

// Draw back button
function drawBackButton() {
    g.setFont("6x8");
    let x = 64;
    let y = 12;
    g.setColor(0xFFFF);
    g.drawString("Back", x, y, "right");
    g.setColor(0x0000);
    g.drawString("Back", x, y, "right");
}

// Draw current BAC value
function drawBACValue() {
    let bac = getBACValue();
    g.setFont("6x8");
    let x = 56;
    let y = 48;
    g.setColor(0xFFFF);
    g.drawString(bac.toFixed(2) + "%", x, y, "left");
    g.setColor(0x0000);
    g.drawString(bac.toFixed(2) + "%", x, y, "left");
}

// Get drink name
function getDrinkName(key) {
    let bev = require('bevtrack').BEVERAGES[key];
    return bev ? bev.name : key;
}

// Get drink index
function getDrinkIndex(key) {
    return require('bevtrack').getBeverageTypes().indexOf(key);
}

// ===== SCREEN 1: CURRENT VALUES =====

// Draw current values screen
function drawCurrentValuesScreen() {
    g.clear();
    drawTitle("Current Values");
    
    drawTextField(12, 28, "BAC:", getBACDisplay());
    drawTextField(12, 36, "Caffeine:", getCaffeineDisplay());
    drawTextField(12, 44, "Time:", getTimeDisplay());
    
    g.setFont("6x8");
    let x = 28;
    let y = 56;
    g.setColor(0xFFFF);
    g.drawString("<", x, y, "center");
    g.setColor(0x0000);
    g.drawString("<", x, y, "center");
    
    g.setFont("6x8");
    let x2 = 44;
    let y2 = 56;
    g.setColor(0xFFFF);
    g.drawString(">", x2, y2, "center");
    g.setColor(0x0000);
    g.drawString(">", x2, y2, "center");
}

// Draw title text
function drawTitle(text) {
    g.setFont("6x8");
    g.setColor(0xFFFF);
    g.drawString(text, 12, 16, "left");
    g.setColor(0x0000);
    g.drawString(text, 12, 16, "left");
}

// Draw text field
function drawTextField(x, y, label, value) {
    g.setFont("6x8");
    g.setColor(0xFFFF);
    g.fillRect(x, y, 56, 8);
    g.setColor(0x0000);
    g.drawString(label, x, y, "left");
    g.setColor(0xFFFF);
    g.drawString(value, x + 28, y, "left");
    g.setColor(0x0000);
    g.drawString(value, x + 28, y, "left");
}

// Get BAC display value
function getBACDisplay() {
    return getBACValue().toFixed(2) + "%";
}

// Get caffeine display value
function getCaffeineDisplay() {
    return Math.round(getCaffeineValue()) + " mg";
}

// Get time display value
function getTimeDisplay() {
    let d = new Date();
    return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
}

// ===== SCREEN 2: LAST 4 DRINKS =====

// Draw last 4 drinks screen
function drawLast4DrinksScreen() {
    g.clear();
    drawTitle("Last 4 Drinks");
    
    let count = 0;
    for (let i = entries.length - 1; i >= entries.length - 5 && count < 4; i--) {
        let e = entries[i];
        let type = require('bevtrack').BEVERAGES[e.type];
        let name = type ? type.name : e.type;
        let d = new Date(e.timestamp);
        let time = d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
        drawDrinkRow(12 + count * 8, name, time);
        count++;
    }
    
    if (count === 0) {
        g.setFont("6x8");
        let x = 20;
        let y = 28;
        g.setColor(0xFFFF);
        g.drawString("No drinks", x, y, "center");
        g.setColor(0x0000);
        g.drawString("No drinks", x, y, "center");
    }
    
    g.setFont("6x8");
    let x = 28;
    let y = 56;
    g.setColor(0xFFFF);
    g.drawString("<", x, y, "center");
    g.setColor(0x0000);
    g.drawString("<", x, y, "center");
    
    g.setFont("6x8");
    let x2 = 44;
    let y2 = 56;
    g.setColor(0xFFFF);
    g.drawString(">", x2, y2, "center");
    g.setColor(0x0000);
    g.drawString(">", x2, y2, "center");
}

// Draw drink row
function drawDrinkRow(y, name, time) {
    g.setFont("6x8");
    let x = 12;
    let w = 60;
    
    // Background
    g.setColor(0x0000);
    g.fillRect(x, y, w, 8);
    g.setColor(0xFFFF);
    g.drawString(name, x, y, "left");
    g.drawString(time, x + 40, y, "left");
}

// ===== SCREEN 3: DAY SUMMARY =====

// Draw day summary screen
function drawDaySummaryScreen() {
    g.clear();
    drawTitle("Day Summary");
    
    let summary = getSummary();
    
    let totalDrinks = summary.totalDrinks || 0;
    let totalCaffeine = summary.totalCaffeine || 0;
    let totalAlcohol = summary.totalAlcohol || 0;
    
    drawTextField(12, 28, "Drinks:", totalDrinks.toString());
    drawTextField(12, 36, "Caffeine:", Math.round(totalCaffeine) + " mg");
    drawTextField(12, 44, "Alcohol:", totalAlcohol.toFixed(1) + " g");
    
    g.setFont("6x8");
    let x = 28;
    let y = 56;
    g.setColor(0xFFFF);
    g.drawString("<", x, y, "center");
    g.setColor(0x0000);
    g.drawString("<", x, y, "center");
    
    g.setFont("6x8");
    let x2 = 44;
    let y2 = 56;
    g.setColor(0xFFFF);
    g.drawString(">", x2, y2, "center");
    g.setColor(0x0000);
    g.drawString(">", x2, y2, "center");
}

// ===== NAVIGATION HANDLERS =====

// Handle swipe left (next screen)
function handleSwipeLeft() {
    if (currentScreen < 3) {
        currentScreen++;
        drawScreen();
    } else {
        currentScreen = 0;
        drawScreen();
    }
}

// Handle swipe right (previous screen)
function handleSwipeRight() {
    if (currentScreen > 0) {
        currentScreen--;
        drawScreen();
    }
}

// Draw current screen
function drawScreen() {
    switch (currentScreen) {
        case 0:
            drawDrinkSelectionScreen();
            break;
        case 1:
            drawCurrentValuesScreen();
            break;
        case 2:
            drawLast4DrinksScreen();
            break;
        case 3:
            drawDaySummaryScreen();
            break;
    }
}

// ===== DRINK SELECTION HELPERS =====

// Handle drink selection with swipe
function handleDrinkSelectionSwipe(direction) {
    const drinks = ['coffee', 'tea', 'beer', 'wine', 'shot', 'energy', 'cola', 'custom'];
    let currentIndex = drinks.indexOf(selectedDrink);
    let newIndex = currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < drinks.length) {
        selectedDrink = drinks[newIndex];
        // Redraw current screen to show new selection
        drawScreen();
    }
}

// Get drink icon for display
function getDrinkIcon(key) {
    let bev = require('bevtrack').BEVERAGES[key];
    return bev ? bev.color : 0xFFFF;
}

// ===== EXPORTS =====

function getBACValue() {
    return require('bevtrack').calculateBAC(entries, settings).bac;
}

function getCaffeineValue() {
    return require('bevtrack').calculateRemainingCaffeine(entries).remaining;
}

function getSummary() {
    return require('bevtrack').getSummary(entries, settings.dateRange.start, settings.dateRange.end);
}

exports.loadData = loadData;
exports.getSettings = getSettings;
exports.getDrinkName = getDrinkName;
exports.getDrinkIcon = getDrinkIcon;
exports.getDrinkIndex = getDrinkIndex;
exports.handleSwipeLeft = handleSwipeLeft;
exports.handleSwipeRight = handleSwipeRight;
exports.handleDrinkSelectionSwipe = handleDrinkSelectionSwipe;
exports.getBACValue = getBACValue;
exports.getCaffeineValue = getCaffeineValue;
exports.getSummary = getSummary;
exports.loadEntries = loadEntries;
exports.loadSettings = loadSettings;
exports.SWIPEUI_VERSION = SWIPEUI_VERSION;
