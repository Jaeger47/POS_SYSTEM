const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allows large files if you have many bills

const DATA_FILE = path.join(__dirname, 'pos_database.json');
const DEFAULT_PRINTER_NAME = process.env.POS_PRINTER_NAME || 'thermal 58';
const RECEIPT_TOP_FEED_LINES = 1;
const RECEIPT_BOTTOM_FEED_LINES = 4;
const RECEIPT_OVERSTRIKE_PASSES = 2;

// Helper to read the file safely
function readData() {
    if (!fs.existsSync(DATA_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

// Endpoint to load all data when the HTML page refreshes
app.get('/load', (req, res) => {
    const data = readData();
    res.json(data);
});

// Endpoint to save data whenever the HTML page updates
app.post('/save', (req, res) => {
    const { key, data } = req.body;
    
    if (!key) return res.status(400).send("No key provided");

    // Read existing file, update the specific key (stock, bills, etc.), and rewrite
    const currentData = readData();
    currentData[key] = data;

    fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2));
    res.send({ success: true });
});

function getDefaultWindowsPrinterName() {
    try {
        const device = require('child_process')
            .execFileSync('powershell.exe', [
                '-NoProfile',
                '-Command',
                "Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows' -Name Device | Select-Object -ExpandProperty Device"
            ], { encoding: 'utf8', timeout: 5000 })
            .trim();

        return device.split(',')[0].trim();
    } catch (e) {
        return '';
    }
}

function buildEscposBuffer(text) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
    const darkText = overstrikeText(normalized, RECEIPT_OVERSTRIKE_PASSES);

    return Buffer.concat([
        Buffer.from([0x1B, 0x40]), // initialize printer
        buildDarkPrintBuffer(),
        Buffer.from([0x1B, 0x45, 0x01]), // bold on
        Buffer.from([0x1B, 0x47, 0x01]), // double-strike on
        buildDrawerPulseBuffer(),
        Buffer.from([0x1B, 0x61, 0x00]), // left align
        Buffer.from('\n'.repeat(RECEIPT_TOP_FEED_LINES), 'ascii'),
        Buffer.from(darkText, 'ascii'),
        Buffer.from('\n'.repeat(RECEIPT_BOTTOM_FEED_LINES), 'ascii'),
        Buffer.from([0x1B, 0x47, 0x00]), // double-strike off
        Buffer.from([0x1B, 0x45, 0x00]), // bold off
        Buffer.from([0x1D, 0x56, 0x42, 0x00]) // partial cut when supported
    ]);
}

function buildDarkPrintBuffer() {
    return Buffer.concat([
        Buffer.from([0x1B, 0x37, 0xFF, 0xFF, 0xFF]), // maximum heat settings on common 58mm units
        Buffer.from([0x12, 0x23, 0xFF]), // high print density on common Chinese ESC/POS firmware
        Buffer.from([0x1D, 0x45, 0xFF]), // high density variant on clone firmware
        Buffer.from([0x1D, 0x28, 0x45, 0x02, 0x00, 0x05, 0x08]), // NV print density variant
        Buffer.from([0x1B, 0x21, 0x08]) // emphasized font mode
    ]);
}

function overstrikeText(text, passes) {
    const count = Math.max(1, Number(passes) || 1);
    if (count === 1) return text;

    return text.split('\n').map(line => {
        if (!line) return '';
        return Array(count).fill(line).join('\r');
    }).join('\n');
}

function buildDrawerPulseBuffer() {
    return Buffer.concat([
        Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]), // open cash drawer on pin 2
        Buffer.from([0x1B, 0x70, 0x01, 0x19, 0xFA])  // fallback pulse for pin 5
    ]);
}

function writeRawToWindowsPrinter(printerName, data) {
    return new Promise((resolve, reject) => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-print-'));
        const dataPath = path.join(tempDir, 'receipt.bin');
        const scriptPath = path.join(tempDir, 'raw-print.ps1');

        fs.writeFileSync(dataPath, data);
        fs.writeFileSync(scriptPath, `
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static bool SendBytes(string printerName, byte[] bytes) {
    IntPtr printer;
    DOCINFOA doc = new DOCINFOA();
    doc.pDocName = "POS Receipt";
    doc.pDataType = "RAW";

    if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }

    IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
      int written;
      bool ok = StartDocPrinter(printer, 1, doc);
      if (ok) ok = StartPagePrinter(printer);
      if (ok) ok = WritePrinter(printer, unmanagedBytes, bytes.Length, out written);
      if (ok) EndPagePrinter(printer);
      if (ok) EndDocPrinter(printer);
      if (!ok) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      return true;
    } finally {
      Marshal.FreeCoTaskMem(unmanagedBytes);
      ClosePrinter(printer);
    }
  }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinterHelper]::SendBytes($PrinterName, $bytes) | Out-Null
`);

        const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            scriptPath,
            '-PrinterName',
            printerName,
            '-FilePath',
            dataPath
        ], { windowsHide: true });

        let stderr = '';
        ps.stderr.on('data', chunk => { stderr += chunk.toString(); });
        ps.on('error', reject);
        ps.on('close', code => {
            fs.rm(tempDir, { recursive: true, force: true }, () => {});
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `Raw print failed with exit code ${code}`));
        });
    });
}

app.get('/printer-default', (req, res) => {
    res.send({
        defaultPrinter: getDefaultWindowsPrinterName(),
        configuredPrinter: DEFAULT_PRINTER_NAME
    });
});

app.post('/print-receipt', async (req, res) => {
    try {
        const printerName = String(req.body.printerName || DEFAULT_PRINTER_NAME).trim();
        const text = String(req.body.text || '').trimEnd();

        if (!printerName) return res.status(400).send({ success: false, error: 'Printer name missing' });
        if (!text) return res.status(400).send({ success: false, error: 'Receipt text missing' });

        await writeRawToWindowsPrinter(printerName, buildEscposBuffer(text));
        res.send({ success: true, printerName });
    } catch (e) {
        res.status(500).send({ success: false, error: e.message });
    }
});

app.post('/open-drawer', async (req, res) => {
    try {
        const printerName = String(req.body.printerName || DEFAULT_PRINTER_NAME).trim();

        if (!printerName) return res.status(400).send({ success: false, error: 'Printer name missing' });

        await writeRawToWindowsPrinter(printerName, buildDrawerPulseBuffer());
        res.send({ success: true, printerName });
    } catch (e) {
        res.status(500).send({ success: false, error: e.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ POS Local Database Server running on http://localhost:${PORT}`);
    console.log(`📁 Your data is saving to: ${DATA_FILE}`);
});
