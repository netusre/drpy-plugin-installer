const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');

const PLUGINS_DIR = path.join(__dirname, 'plugins');
const TEMP_DIR = path.join(__dirname, 'temp');

fs.ensureDirSync(PLUGINS_DIR);
fs.ensureDirSync(TEMP_DIR);

function listPlugins() {
    const plugins = [];
    if (!fs.existsSync(PLUGINS_DIR)) return plugins;
    const dirs = fs.readdirSync(PLUGINS_DIR);
    for (const dir of dirs) {
        const pluginPath = path.join(PLUGINS_DIR, dir);
        if (!fs.statSync(pluginPath).isDirectory()) continue;
        const info = { name: dir, path: pluginPath, installed: true };
        const pkgFile = path.join(pluginPath, 'package.json');
        const reqFile = path.join(pluginPath, 'requirements.txt');
        if (fs.existsSync(pkgFile)) {
            try { Object.assign(info, JSON.parse(fs.readFileSync(pkgFile, 'utf8'))); } catch (e) {}
        }
        info.hasRequirements = fs.existsSync(reqFile);
        plugins.push(info);
    }
    return plugins;
}

async function install({ url, name }) {
    console.log(`[PluginManager] 开始安装: ${name}`);
    console.log(`[PluginManager] 下载地址: ${url}`);

    const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
    const pluginDir = path.join(PLUGINS_DIR, safeName);

    if (fs.existsSync(pluginDir)) {
        console.log(`[PluginManager] 目标目录已存在，先清理: ${safeName}`);
        fs.removeSync(pluginDir);
    }

    const tempFile = path.join(TEMP_DIR, `${safeName}_${Date.now()}.zip`);
    try {
        console.log(`[PluginManager] 正在下载...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 120000
        });

        if (!response.ok) {
            throw new Error(`下载失败: HTTP ${response.status}`);
        }

        const buffer = await response.buffer();
        fs.writeFileSync(tempFile, buffer);
        console.log(`[PluginManager] 下载完成, 大小: ${(buffer.length / 1024).toFixed(1)} KB`);

        console.log(`[PluginManager] 正在解压...`);
        const zip = new AdmZip(tempFile);
        const entries = zip.getEntries();

        let hasTopDir = false;
        let topDir = '';
        if (entries.length > 0) {
            const firstEntry = entries[0].entryName.split('/')[0];
            const allInSameDir = entries.every(e => e.entryName.startsWith(firstDir(firstEntry)));
            if (allInSameDir && firstEntry !== safeName) {
                hasTopDir = true;
                topDir = firstEntry;
            }
        }

        if (hasTopDir) {
            fs.ensureDirSync(pluginDir);
            zip.extractAllTo(TEMP_DIR + '/_extract_' + Date.now(), true);
            const extractedDir = path.join(TEMP_DIR, '_extract_' + Date.now(), topDir);
            if (fs.existsSync(extractedDir)) {
                fs.copySync(extractedDir, pluginDir);
                fs.removeSync(path.join(TEMP_DIR, '_extract_' + Date.now()));
            }
        } else {
            fs.ensureDirSync(pluginDir);
            zip.extractAllTo(pluginDir, true);
        }

        console.log(`[PluginManager] 解压完成`);

        const reqFile = path.join(pluginDir, 'requirements.txt');
        if (fs.existsSync(reqFile)) {
            console.log(`[PluginManager] 检测到 requirements.txt, 正在安装依赖...`);
            try {
                const pythonCmd = findPython();
                execSync(`${pythonCmd} -m pip install -r "${reqFile}" --quiet`, {
                    timeout: 300000,
                    stdio: 'pipe'
                });
                console.log(`[PluginManager] 依赖安装完成`);
            } catch (e) {
                console.error(`[PluginManager] 依赖安装失败: ${e.message}`);
            }
        }

        console.log(`[PluginManager] 插件安装成功: ${safeName}`);
        return { name: safeName, path: pluginDir };

    } finally {
        if (fs.existsSync(tempFile)) {
            fs.removeSync(tempFile);
        }
    }
}

function firstDir(entryName) {
    const parts = entryName.split('/');
    return parts[0];
}

async function remove(name) {
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
    const pluginDir = path.join(PLUGINS_DIR, safeName);
    if (!fs.existsSync(pluginDir)) {
        throw new Error(`插件不存在: ${safeName}`);
    }
    fs.removeSync(pluginDir);
    console.log(`[PluginManager] 已卸载: ${safeName}`);
}

function findPython() {
    const candidates = ['python3', 'python', 'py'];
    for (const cmd of candidates) {
        try {
            execSync(`${cmd} --version`, { stdio: 'pipe' });
            return cmd;
        } catch (e) {}
    }
    return 'python3';
}

module.exports = { listPlugins, install, remove };
