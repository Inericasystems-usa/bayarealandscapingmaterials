// Inerica POS desktop app. Loads the POS web app in a native window.
// Set INERICA_POS_URL to point the app at the local/served POS (defaults to the
// local install). A future onboarding step will let a client set this per store.
const { app, BrowserWindow, shell } = require("electron");

const POS_URL = process.env.INERICA_POS_URL || process.env.BALM_POS_URL || "http://localhost:3000/pos";

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "Inerica POS",
    backgroundColor: "#101010",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.loadURL(POS_URL);

  // Open external links (maps, etc.) in the system browser, not the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
