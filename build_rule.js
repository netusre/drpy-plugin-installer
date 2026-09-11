const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RULE_FILE = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/rule_modified.json';
const RULE_ALSO = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/rule_plugin.json';
const OUT_RULE = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/rule_hacker/out/rule.json';
const RUNTIME_DIR = 'C:/Users/Administrator/Desktop/新建文件夹/drpy-plugin-installer/plugins_runtime';

// ---- scan runtime dir -> manifest ----
const SKIP = new Set(['一键安装Python扩展.hkshell', 'TestPythonHiker.hiker']);
function md5file(p) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('md5');
    const s = fs.createReadStream(p);
    s.on('error', rej);
    s.on('data', d => h.update(d));
    s.on('end', () => res(h.digest('hex').toUpperCase()));
  });
}
function walk(dir, base) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.posix.join(base, e.name);
    if (e.isDirectory()) { out = out.concat(walk(full, rel)); }
    else { out.push({ p: rel, full }); }
  }
  return out;
}
function enc(rel) { return rel.split('/').map(encodeURIComponent).join('/'); }

async function main() {
  const entries = walk(RUNTIME_DIR, '');
  const withMd5 = [];
  for (const en of entries) {
    const h = await md5file(en.full);
    withMd5.push({ p: en.p, u: enc(en.p), s: fs.statSync(en.full).size, h });
  }
  withMd5.sort((a, b) => a.p < b.p ? -1 : 1);
  const MANIFEST = JSON.stringify(withMd5);

  const PLUGIN_INSTALL_JS = `js:
// ===== Python 扩展运行时安装页面(纯海阔, 无需电脑服务/无需解压) =====
var d = [];
function has(p) { try { return fileExist(p); } catch (e) { return false; } }
var runtimeOk = has('hiker://files/plugins/chaquopy/PythonHiker.js') && has('hiker://files/plugins/chaquopy/chaquopy.apk');
var fileCount = ${withMd5.length};
d.push({
    title: 'DrpyHiker Python 扩展运行时 (v12 优化版)',
    desc: '一键部署 PythonHiker.js + chaquopy 运行时到海阔本地目录, 共 ' + fileCount + ' 个文件 (' + ${Math.round(withMd5.reduce((s,e)=>s+e.s,0)/1024/1024)} + 'MB)',
    img: 'https://img.icons8.com/doodle/48/000000/python--v1.png',
    url: 'hiker://empty',
    col_type: 'movie_2',
    extra: {}
});
if (runtimeOk) {
    d.push({
        title: '[ 已安装 ] 点击重新部署',
        desc: 'hiker://files/plugins/chaquopy/PythonHiker.js 已就绪, 重新部署可修复缺失组件',
        img: 'https://img.icons8.com/doodle/48/000000/refresh.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
} else {
    d.push({
        title: '[ 一键安装 ]',
        desc: '自动下载并部署全部运行时文件(约${Math.round(withMd5.reduce((s,e)=>s+e.s,0)/1024/1024)}MB), 请保持网络稳定',
        img: 'https://img.icons8.com/doodle/48/000000/install.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
}
d.push({
    title: '说明',
    desc: '安装目标: hiker://files/plugins/chaquopy/   解决: Module "PythonHiker.js" cannot be found',
    img: 'https://img.icons8.com/doodle/48/000000/info.png',
    url: 'hiker://empty',
    col_type: 'movie_2',
    extra: {}
});
setResult(d);
`;

  const PLUGIN_RUN_JS = `js:
// ===== DrpyHiker Python 运行时一键部署执行页(纯海阔, 逐文件下载+MD5校验) =====
var d = [];
var BASE1 = 'https://cdn.jsdelivr.net/gh/netusre/drpy-plugin-installer@master/plugins_runtime/';
var BASE2 = 'https://raw.githubusercontent.com/netusre/drpy-plugin-installer/master/plugins_runtime/';
var ROOT = 'hiker://files/plugins/chaquopy/';
var FILES = ${MANIFEST};
function abs(p) {
    var fp = '';
    try { fp = getPath(p); } catch (e) {}
    if (typeof fp === 'string' && fp.indexOf('file://') === 0) { fp = fp.substring(7); }
    return fp;
}
function has(p) { try { return fileExist(p); } catch (e) { return false; } }
function sig(p) { try { var m = md5(p); return (m && String(m).length > 8) ? String(m).toUpperCase() : ''; } catch (e) { return ''; } }
function del(p) {
    try {
        var f = new java.io.File(abs(p));
        if (f && f.exists()) { f.delete(); }
    } catch (e) {}
}
function one(entry, base) {
    var target = ROOT + entry.p;
    try { if (has(target)) { del(target); } } catch (e) {}
    try { downloadFile(base + entry.u, target); } catch (e) { return 'err:' + String(e); }
    if (!has(target)) { return 'err:nofile'; }
    return sig(target) === entry.h ? 'ok' : 'bad';
}
var okCount = 0;
var failList = [];
var i, r;
for (i = 0; i < FILES.length; i++) {
    r = one(FILES[i], BASE1);
    if (r !== 'ok') { r = one(FILES[i], BASE2); }
    if (r === 'ok') { okCount++; } else { failList.push(FILES[i].p + '<' + r + '>'); }
}
var pyOk = has(ROOT + 'PythonHiker.js');
var apkOk = has(ROOT + 'chaquopy.apk');
if (failList.length === 0) {
    var mb = 0; try { mb = new java.io.File(abs(ROOT)).length(); } catch (e) { mb = 0; }
    d.push({
        title: '[ 部署成功 ]',
        desc: '已就绪 ' + okCount + '/' + FILES.length + ' 个文件, PythonHiker.js: ' + (pyOk ? 'OK' : '缺失') + ', chaquopy.apk: ' + (apkOk ? 'OK' : '缺失'),
        img: 'https://img.icons8.com/doodle/48/000000/ok.png',
        url: 'hiker://page/plugininstall',
        col_type: 'movie_2',
        extra: {}
    });
} else {
    d.push({
        title: '[ 部署未完成 ]',
        desc: '成功 ' + okCount + '/' + FILES.length + ' 项, 失败 ' + failList.length + ' 项: ' + failList.join(', ').substring(0, 200),
        img: 'https://img.icons8.com/doodle/48/000000/error.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
    d.push({
        title: '[ 重试 ]',
        desc: '点击重新执行部署 (自动重试失败项)',
        img: 'https://img.icons8.com/doodle/48/000000/refresh.png',
        url: 'hiker://page/pluginrun',
        col_type: 'movie_2',
        extra: {}
    });
}
if (!pyOk || !apkOk) {
    d.push({
        title: '[ 手动修复 ]',
        desc: '解除 DrpyHiker 报错需 PythonHiker.js 与 chaquopy.apk 就位于 hiker://files/plugins/chaquopy/',
        img: 'https://img.icons8.com/doodle/48/000000/link.png',
        url: 'hiker://browser?url=' + encodeURIComponent(BASE1 + 'PythonHiker.js'),
        col_type: 'movie_2',
        extra: {}
    });
}
setResult(d);
`;

  const rule = JSON.parse(fs.readFileSync(RULE_FILE, 'utf8'));
  let pages = typeof rule.pages === 'string' ? JSON.parse(rule.pages) : rule.pages;
  pages = pages.slice();

  let idx = pages.findIndex(p => p.path === 'plugininstall');
  if (idx >= 0) {
    pages[idx] = Object.assign({}, pages[idx], { rule: PLUGIN_INSTALL_JS });
  } else {
    pages.push({ col_type: 'movie_2', name: 'plugininstall', path: 'plugininstall', rule: PLUGIN_INSTALL_JS });
  }

  const ri = pages.findIndex(p => p.path === 'pluginrun');
  if (ri >= 0) {
    pages[ri] = Object.assign({}, pages[ri], { rule: PLUGIN_RUN_JS });
  } else {
    pages.push({ col_type: 'movie_2', name: 'pluginrun', path: 'pluginrun', rule: PLUGIN_RUN_JS });
  }

  const home = pages.find(p => p.path === 'home');
  if (home) {
    const hr = String(home.rule);
    const hr2 = hr.replace(/'drpy扩展插件一键部署到后端'/, "'Python 扩展运行时一键安装(解决 PythonHiker.js 缺失)'");
    home.rule = hr2;
  }

  rule.pages = JSON.stringify(pages);
  if (!fs.existsSync(path.dirname(OUT_RULE))) {
    fs.mkdirSync(path.dirname(OUT_RULE), { recursive: true });
  }
  fs.writeFileSync(RULE_FILE, JSON.stringify(rule), 'utf8');
  fs.writeFileSync(RULE_ALSO, JSON.stringify(rule), 'utf8');
  fs.writeFileSync(OUT_RULE, JSON.stringify(rule), 'utf8');

  console.log('done. manifest files:', withMd5.length);
  console.log('pages:', pages.map(p => p.path).join(','));
  console.log('plugininstall ruleLen:', String(pages.find(p => p.path === 'plugininstall').rule).length);
  console.log('pluginrun ruleLen:', String(pages.find(p => p.path === 'pluginrun').rule).length);
  console.log('rule.json bytes:', fs.statSync(OUT_RULE).size);
}

main().catch(e => { console.error(e); process.exit(1); });