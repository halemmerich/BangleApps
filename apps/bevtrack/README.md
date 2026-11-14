# BevTrack - Beverage Tracking App

Track your beverages and monitor active components (caffeine and alcohol) over time.

## Features

- **Quick Beverage Entry** - Select from 7 common beverages or use custom
- **Caffeine Tracking** - Calculates total caffeine and remaining in body (5-hour half-life)
- **Alcohol Tracking** - Real-time BAC (Blood Alcohol Concentration) calculation
- **Compact Storage** - Single log file with one line per entry for easy backup
- **Settings** - Configure weight, gender, and units (metric/imperial)

## Supported Beverages

| Beverage | Caffeine (mg/100ml) | Alcohol (g/100ml) |
|----------|---------------------|-------------------|
| Coffee   | 80                  | 0                 |
| Tea      | 30                  | 0                 |
| Beer     | 10                  | 12                |
| Wine     | 0                   | 16                |
| Shot     | 0                   | 5.6               |
| Energy   | 100                 | 0                 |
| Cola     | 40                  | 0                 |

## Storage Format

Data is stored in a compact append-only log file:

```
2024-01-15T10:30:00|coffee|250|80|0|
2024-01-15T14:45:00|beer|330|10|12|
2024-01-16T09:00:00|tea|200|30|0|
```

Format: `TIMESTAMP|TYPE|VOLUME|CAFFEINE|ALCOHOL|NOTES`

This format is easy to:
- Backup (copy single file)
- Parse in other apps
- Analyze externally

## Usage

The bottom bar switches between four screens: **Drink**, **Now**, **Log** and **Day**.
Swipe up or down to move through the screens.

### Drink Screen
- **Tap the colored circle**: log the selected drink
- **Swipe left/right on the circle**: choose a different drink
- **Swipe left/right on the volume**: adjust the serving size
- Each drink starts at a typical serving size (for example 500 ml beer, 175 ml wine, 44 ml shot)

### Now Screen
Shows current BAC and remaining caffeine.

### Log Screen
Shows your most recent drinks with timestamps. Tap an entry to delete it.

### Day Screen
Shows drink, caffeine and alcohol totals for the last 7 days.

## BAC Calculation

Uses Widmark formula:
```
BAC = (Total Alcohol in g / (Weight × Gender Factor)) - (0.15 × Hours)
```

- Male factor: 0.70
- Female factor: 0.60
- Alcohol metabolism: 0.15 g/L/hour

## Settings

- **Weight**: Your body weight in kg (30-200 kg)
- **Gender**: Male or female (affects BAC calculation)
- **Units**: Metric (ml) or Imperial (oz)

## Widget Support

BevTrack can display a widget showing your current BAC or caffeine level. Check the widget bar when the app is running.

## Tips

- Drink water to help process alcohol
- Caffeine has a half-life of about 5 hours
- BAC decreases by about 0.015 per hour
- Be responsible - don't drink and drive!
