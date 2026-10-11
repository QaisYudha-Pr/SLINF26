const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');

let configCache = null;

function loadConfig() {
  if (configCache) return configCache;
  try {
    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        prefix: '!',
        ownerNumbers: [],
        targetJids: [],
        autoSend: {
          enabled: false,
          cronTime: '0 7 * * *',
          timezone: 'Asia/Jakarta'
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      configCache = defaultConfig;
      return defaultConfig;
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    if (!cfg.defaultLecturers) {
      cfg.defaultLecturers = ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'];
    }
    configCache = cfg;
    return cfg;
  } catch (err) {
    console.error('Error saat membaca config.json:', err.message);
    return {
      prefix: '!',
      ownerNumbers: [],
      targetJids: [],
      autoSend: { enabled: false, cronTime: '0 7 * * *', timezone: 'Asia/Jakarta' },
      defaultLecturers: ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']
    };
  }
}

function saveConfig(newConfig) {
  try {
    configCache = newConfig;
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Gagal menyimpan config.json:', err.message);
    return false;
  }
}

module.exports = {
  loadConfig,
  saveConfig
};
