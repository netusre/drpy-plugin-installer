const fs = require('fs');

const RULE_FILE = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/rule_modified.json';
const RULE_ALSO = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/rule_plugin.json';
const OUT_RULE = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/out/rule.json';

const PLUGIN_INSTALL_JS = `js:
// ===== Python 插件一键安装页面(纯海阔, 无需电脑服务) =====
var d = [];
var TARGET = 'hiker://files/drpy/plugins/PythonExtensionPlugin_v12.hkpkg';
var installed = false;
try { installed = fileExist(TARGET); } catch (e) { installed = false; }
function abs(p) {
    var fp = '';
    try { fp = getPath(p); } catch (e) {}
    if (typeof fp === 'string' && fp.indexOf('file://') === 0) { fp = fp.substring(7); }
    return fp;
}
function fsize(p) {
    try {
        var f = new java.io.File(abs(p));
        return (f && f.exists()) ? f.length() : 0;
    } catch (e) { return 0; }
}
d.push({
    title: 'PythonExtensionPlugin_v12 (优化版)',
    desc: 'drpy Python 扩展插件, 一键静默安装到海阔本地目录',
    img: 'https://img.icons8.com/doodle/48/000000/python--v1.png',
    url: 'hiker://empty',
    col_type: 'movie_2',
    extra: {}
});
if (installed) {
    var sz = fsize(TARGET);
    d.push({
        title: '[ 已安装 ] 点击重新安装',
        desc: '文件: ' + Math.round(sz / 1024 / 1024 * 10) / 10 + ' MB  |  hiker://files/drpy/plugins/PythonExtensionPlugin_v12.hkpkg',
        img: 'https://img.icons8.com/doodle/48/000000/refresh.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
} else {
    d.push({
        title: '[ 一键安装 ]',
        desc: '自动静默下载安装(约12MB), 无需电脑服务',
        img: 'https://img.icons8.com/doodle/48/000000/install.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
}
d.push({
    title: '安装信息',
    desc: '目标目录: hiker://files/drpy/plugins/   版本: v12 优化版   来源: GitHub 直链',
    img: 'https://img.icons8.com/doodle/48/000000/info.png',
    url: 'hiker://empty',
    col_type: 'movie_2',
    extra: {}
});
setResult(d);
`;

const PLUGIN_RUN_JS = `js:
// ===== Python 插件静默安装执行页(纯海阔) =====
var d = [];
var DOWNLOAD_URL = 'https://cdn.jsdelivr.net/gh/netusre/drpy-plugin-installer@master/plugins/PythonExtensionPlugin_v12.hkpkg';
var FALLBACK_URL = 'https://raw.githubusercontent.com/netusre/drpy-plugin-installer/master/plugins/PythonExtensionPlugin_v12.hkpkg';
var TARGET = 'hiker://files/drpy/plugins/PythonExtensionPlugin_v12.hkpkg';
var EXPECT_MD5 = 'EAD3EBDD6AE133228C72277572AD78C6';
function abs(p) {
    var fp = '';
    try { fp = getPath(p); } catch (e) {}
    if (typeof fp === 'string' && fp.indexOf('file://') === 0) { fp = fp.substring(7); }
    return fp;
}
function exists(p) { try { return fileExist(p); } catch (e) { return false; } }
function sig(p) {
    try { var m = md5(p); return (m && String(m).length > 8) ? String(m).toUpperCase() : ''; } catch (e) { return ''; }
}
function deleteOld() {
    try {
        var f = new java.io.File(abs(TARGET));
        if (f && f.exists()) { f.delete(); }
    } catch (e) {}
}
function verify() {
    if (!exists(TARGET)) { return false; }
    try { return sig(TARGET) === EXPECT_MD5; } catch (e) { return false; }
}
function tryDownload(url) {
    try { downloadFile(url, TARGET); } catch (e) { return 'err:' + String(e); }
    return verify() ? 'ok' : 'bad';
}
deleteOld();
var r = tryDownload(DOWNLOAD_URL);
if (r !== 'ok') {
    deleteOld();
    r = tryDownload(FALLBACK_URL);
}
if (r === 'ok') {
    var sz = 0;
    try { sz = new java.io.File(abs(TARGET)).length(); } catch (e) {}
    d.push({
        title: '[ 安装成功 ]',
        desc: '已写入 hiker://files/drpy/plugins/PythonExtensionPlugin_v12.hkpkg (' + Math.round(sz / 1024 / 1024 * 10) / 10 + ' MB)',
        img: 'https://img.icons8.com/doodle/48/000000/ok.png',
        url: 'hiker://page/plugininstall',
        col_type: 'movie_2',
        extra: {}
    });
} else {
    d.push({
        title: '[ 安装失败 ]',
        desc: (r.indexOf('err:') === 0 ? '下载异常: ' + r.substring(4) : '已下载但文件校验不匹配, 请检查网络后重试'),
        img: 'https://img.icons8.com/doodle/48/000000/error.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
    d.push({
        title: '[ 手动下载 ]',
        desc: '浏览器打开直链下载文件, 放入目录: hiker://files/drpy/plugins/',
        img: 'https://img.icons8.com/doodle/48/000000/link.png',
        url: 'hiker://browser?url=' + encodeURIComponent(DOWNLOAD_URL),
        col_type: 'movie_2',
        extra: {}
    });
}
setResult(d);
`;

const rule = JSON.parse(fs.readFileSync(RULE_FILE, 'utf8'));
let pages = typeof rule.pages === 'string' ? JSON.parse(rule.pages) : rule.pages;
pages = pages.slice();

// replace plugininstall page rule
let idx = pages.findIndex(p => p.path === 'plugininstall');
if (idx >= 0) {
  const pg = Object.assign({}, pages[idx], { rule: PLUGIN_INSTALL_JS });
  pages[idx] = pg;
} else {
  pages.push({ col_type: 'movie_2', name: 'plugininstall', path: 'plugininstall', rule: PLUGIN_INSTALL_JS });
}

// add pluginrun page (or refresh it)
const ri = pages.findIndex(p => p.path === 'pluginrun');
if (ri >= 0) {
  pages[ri] = Object.assign({}, pages[ri], { rule: PLUGIN_RUN_JS });
} else {
  pages.push({ col_type: 'movie_2', name: 'pluginrun', path: 'pluginrun', rule: PLUGIN_RUN_JS });
}

// update home entry card desc
const home = pages.find(p => p.path === 'home');
if (home) {
  const hr = String(home.rule);
  const hr2 = hr.replace(/'drpy扩展插件一键部署到后端'/, "'Python 扩展插件一键静默安装(无需电脑服务)'");
  home.rule = hr2;
}

rule.pages = JSON.stringify(pages);

if (!fs.existsSync('C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/out')) {
  fs.mkdirSync('C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/out', { recursive: true });
}
fs.writeFileSync(RULE_FILE, JSON.stringify(rule), 'utf8');
fs.writeFileSync(RULE_ALSO, JSON.stringify(rule), 'utf8');
fs.writeFileSync(OUT_RULE, JSON.stringify(rule), 'utf8');

console.log('done.');
console.log('pages:', pages.map(p => p.path).join(','));
console.log('plugininstall ruleLen:', String(pages.find(p => p.path === 'plugininstall').rule).length);
console.log('pluginrun ruleLen:', String(pages.find(p => p.path === 'pluginrun').rule).length);
console.log('rule.json bytes:', fs.statSync(OUT_RULE).size);