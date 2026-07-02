# POS System - Windows Setup Guide

This POS system is intended to run on Windows with a 58 mm ESC/POS thermal printer. The local Node.js server saves the POS data, prints receipts without extra paper, and sends the cash-drawer pulse.

## Requirements

- Windows 10 or Windows 11
- A USB 58 mm ESC/POS thermal printer (tested configuration: VOZY P50)
- A cash drawer connected to the printer's RJ11/RJ12 drawer port, if used
- Internet access during the first installation
- [Node.js LTS](https://nodejs.org/) version 18 or newer

Do not connect the cash drawer to a telephone socket. It must connect to the drawer port on the thermal printer.

## 1. Download the project

Download the repository as a ZIP from GitHub and extract it to a permanent folder, or clone it with Git:

```powershell
git clone https://github.com/Jaeger47/POS_SYSTEM.git
cd POS_SYSTEM
```

Avoid running the app directly from inside the ZIP file.

## 2. Install Node.js

Download and install the current **LTS** version from [nodejs.org](https://nodejs.org/). Keep the default installer options enabled, including **Add to PATH**.

Open a new Command Prompt after installation and verify it:

```bat
node --version
npm --version
```

Both commands should display a version number.

## 3. Install the project libraries

Open Command Prompt or PowerShell inside the extracted project folder, then run:

```bat
npm install
```

This installs the libraries listed in `package.json`:

- `express` - runs the local POS server
- `cors` - allows the POS page to communicate with the local server

Do not run `npm init` and do not install the libraries globally. `npm install` is required only on first setup, after downloading an update that changes `package.json`, or after deleting the `node_modules` folder.

## 4. Install and configure the printer

1. Install the printer's Windows driver and connect the printer by USB.
2. Open **Settings > Bluetooth & devices > Printers & scanners**.
3. Select the thermal printer and open **Printer properties**.
4. Rename it exactly to:

```text
thermal 58
```

5. Set the paper width to **58 mm** and use the shortest available receipt or continuous-paper setting.
6. Disable options such as **Fit to page**, headers, footers, and extra page margins when available.
7. Set print density/darkness to the highest suitable level in the printer preferences.
8. Print a Windows test page to confirm the printer works.

The name must match exactly, including the space. The app sends raw ESC/POS data to this Windows printer name.

### Use a different printer name

The easiest option is to rename the printer to `thermal 58`. If that is not possible, start the server from Command Prompt with the installed printer name:

```bat
set POS_PRINTER_NAME=Your Printer Name
node server.js
```

Keep that window open while using the POS.

## 5. Connect the cash drawer

Connect the drawer cable to the **cash drawer port on the printer**, not directly to the computer. The POS sends ESC/POS pulses for both common drawer pins when a receipt prints or the drawer-open function is used.

The drawer will not open automatically if it is USB-only, connected to the wrong port, locked with its key, or incompatible with the printer's drawer voltage/pinout.

## 6. Start the POS

Double-click:

```text
Start.bat
```

The script starts the local server, waits briefly, and opens `index.html` in the default browser. Keep the **POS Database Server** command window open. Closing it stops saving, printing, and cash-drawer commands.

You can also start it manually:

```bat
npm start
```

Then open `index.html` in a browser. The local server runs at `http://localhost:3000`.

## Moving to another computer

1. Copy or download the whole project folder.
2. Install Node.js LTS on the new computer.
3. Run `npm install` inside the project folder.
4. Install and rename the printer to `thermal 58`.
5. Connect the cash drawer to the printer.
6. Double-click `Start.bat`.

To move existing products, sales, and settings, copy `pos_database.json` from the old computer into the new project folder before starting the POS. Keep a backup of this file.

## Troubleshooting

### `node` or `npm` is not recognized

Restart the computer or reopen Command Prompt after installing Node.js. If it still fails, reinstall Node.js and ensure **Add to PATH** is enabled.

### The page opens but does not save or print

Make sure the **POS Database Server** window is still open and shows:

```text
POS Local Database Server running on http://localhost:3000
```

If port 3000 is already in use, close the other program or previous POS server before running `Start.bat` again.

### Printer not found

Check the exact installed name in **Printer properties**. It must be `thermal 58`, unless `POS_PRINTER_NAME` was set before manually starting the server.

### Receipt is too long or feeds excess paper

Confirm the driver uses 58 mm continuous receipt paper. Raw printing should stop shortly after the final printed line; driver page-size settings can still add unwanted feeding on some printer models.

### Print is faded

- Set density/darkness to maximum in the Windows printer driver.
- Use fresh thermal paper with the heat-sensitive side facing the print head.
- Clean the print head according to the printer manual.
- Use the correct power adapter supplied for the printer.

The app already sends strong ESC/POS density, bold, and double-strike commands. If printing remains faded, the cause is likely the driver, thermal paper, print head, or power supply.

### Cash drawer does not open

- Confirm the drawer is connected to the printer's drawer port.
- Unlock the drawer with its key.
- Confirm the drawer voltage and cable pinout are compatible with the printer.
- Try printing a receipt and using the POS drawer-open button.

## Data and backups

All local POS data is stored in:

```text
pos_database.json
```

Back up this file regularly. Do not replace or delete it while the server is running.
