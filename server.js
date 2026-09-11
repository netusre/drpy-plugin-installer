const express = require('express');
const cors = require('cors');
const path = require('path');
const pluginManager = require('./pluginManager');
const guangyaParser = require('./guangyaParser');

const app = express();
const PORT = process.env.PORT || 5800;

app.use(cors());
app.use(express.json());

/* ===== 任务系统: 提供给 Hiker 小程序实时进度 ===== */

const tasks = new Map();

function newTask() {
    const id = 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const t = { id, status: 'running', logs: [], done: false, success: false, result: null, error: null };
    tasks.set(id, t);
    return t;
}

function tlog(t, msg) {
    t.logs.push('[' + new Date().toLocaleTimeString() + '] ' + msg);
    console.log('  [task ' + t.id + '] ' + msg);
}

function tdone(t, success, result, error) {
    t.done = true;
    t.success = success;
    t.result = result || null;
    t.error = error || null;
    t.status = success ? 'success' : 'failed';
}

async function runInstall(t, url, name) {
    try {
        tlog(t, '收到安装请求');
        let targetUrl = url;
        let targetName = name;

        if (/guangyapan\.com/.test(url)) {
            tlog(t, '检测到光鸭云盘链接，正在解析直链...');
            const r = await guangyaParser.resolve(url);
            targetUrl = r.url;
            if (!targetName) targetName = r.filename;
            tlog(t, '直链解析成功: ' + targetUrl);
        }
        if (!targetName) targetName = 'plugin_' + Date.now();

        tlog(t, '开始下载并部署插件: ' + targetName);
        const result = await pluginManager.install({ url: targetUrl, name: targetName });

        tlog(t, '安装完成，插件目录: ' + result.path);
        tdone(t, true, result, null);
    } catch (e) {
        tlog(t, '安装失败: ' + e.message);
        tdone(t, false, null, e.message);
    }
}

/* ===== 基础接口 ===== */

app.get('/', (req, res) => {
    res.json({
        name: 'drpy-plugin-installer',
        version: '1.1.0',
        status: 'running',
        endpoints: [
            'GET  /api/plugin/status',
            'POST /api/plugin/start',
            'GET  /api/plugin/task?id=xxx',
            'GET  /api/plugin/install_page?url=&name=',
            'GET  /api/plugin/remove_page?name=',
            'POST /api/plugin/install',
            'POST /api/plugin/install_sync',
            'POST /api/plugin/remove',
            'POST /api/plugin/resolve'
        ]
    });
});

app.get('/api/plugin/status', async (req, res) => {
    try {
        const plugins = await pluginManager.listPlugins();
        res.json({ success: true, plugins });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

/* ===== 安装任务: 启动 / 查询 ===== */

app.post('/api/plugin/start', async (req, res) => {
    const { url, name } = req.body || {};
    if (!url) {
        return res.json({ success: false, message: '缺少 url 参数' });
    }
    const t = newTask();
    res.json({ success: true, taskId: t.id });
    runInstall(t, url, name).catch(e => tdone(t, false, null, e.message));
});

app.get('/api/plugin/task', (req, res) => {
    const { id } = req.query;
    const t = tasks.get(id);
    if (!t) return res.json({ success: false, message: '任务不存在或已过期' });
    res.json({
        success: true,
        status: t.status,
        done: t.done,
        successDone: t.success,
        logs: t.logs,
        result: t.result,
        error: t.error
    });
});

/* ===== HTML 页面: 供 Hiker 小程序 hiker://empty?action=openUrl 打开 ===== */

function layout(title, body) {
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + title + '</title><style>' +
        'body{font-family:-apple-system,"Microsoft YaHei",sans-serif;background:#0f1420;color:#e6edf3;margin:0;padding:16px}' +
        '.card{background:#182235;border-radius:12px;padding:16px;margin-bottom:14px}' +
        'h2{margin:0 0 6px;font-size:18px;color:#58a6ff;word-break:break-all}' +
        'p{margin:4px 0;color:#9db1c7;font-size:13px}' +
        '.log{background:#0b0f18;border:1px solid #1f2937;border-radius:8px;padding:10px;max-height:260px;overflow:auto;font-family:Consolas,monospace;font-size:12px;color:#7ee787;line-height:1.6}' +
        '.ok{color:#3fb950;font-size:16px;font-weight:bold;margin:8px 0}' +
        '.bad{color:#f85149;font-size:16px;font-weight:bold;margin:8px 0}' +
        '.btn{display:inline-block;background:#1f6feb;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:14px;margin-top:10px}' +
        'a{color:#58a6ff}' +
        '</style></head><body>' + body + '</body></html>';
}

function installPageHtml(url, name) {
    const body =
        '<div class="card"><h2>Python插件一键安装</h2>' +
        '<p>插件: ' + (name || '未命名') + '</p>' +
        '<p id="hint">正在启动安装任务...</p></div>' +
        '<div class="card"><p>安装日志</p><div class="log" id="log"></div></div>' +
        '<div class="card" id="result"></div>' +
        '<script>' +
        'var params=new URLSearchParams(location.search);' +
        'var purl=params.get("url")||"";' +
        'var pname=params.get("name")||"";' +
        'var logEl=document.getElementById("log");' +
        'var resEl=document.getElementById("result");' +
        'var hintEl=document.getElementById("hint");' +
        'var shown=0;' +
        'function render(logs){' +
        '  for(;shown<logs.length;shown++){' +
        '    var div=document.createElement("div");div.textContent=logs[shown];logEl.appendChild(div);' +
        '  }' +
        '  logEl.scrollTop=logEl.scrollHeight;' +
        '}' +
        'function poll(id){' +
        '  fetch("/api/plugin/task?id="+id).then(function(r){return r.json()}).then(function(t){' +
        '    render(t.logs||[]);' +
        '    if(t.done){' +
        '      if(t.successDone){' +
        '        hintEl.textContent="安装成功";' +
        '        resEl.innerHTML=\'<div class="ok">\\u2714 安装成功</div>\' +' +
        '          "<p>插件名: "+(t.result&&t.result.name||"")+"</p>" +' +
        '          "<p>目录: "+(t.result&&t.result.path||"")+"</p>";' +
        '      } else {' +
        '        hintEl.textContent="安装失败";' +
        '        resEl.innerHTML=\'<div class="bad">\\u2716 安装失败</div>\' +' +
        '          "<p>"+((t.error||"未知错误")+"".replace(/</g,"&lt;"))+"</p>";' +
        '      }' +
        '    } else {' +
        '      setTimeout(function(){poll(id)},1200);' +
        '    }' +
        '  }).catch(function(){' +
        '    hintEl.textContent="后端通信异常，请确认服务已启动";' +
        '  });' +
        '}' +
        'fetch("/api/plugin/start",{' +
        '  method:"POST",headers:{"Content-Type":"application/json"},' +
        '  body:JSON.stringify({url:purl,name:pname})' +
        '}).then(function(r){return r.json()}).then(function(j){' +
        '  if(j.success&&j.taskId){hintEl.textContent="安装中，请稍候...";poll(j.taskId);}' +
        '  else{ hintEl.textContent=(j.message||"启动失败"); }' +
        '}).catch(function(){hintEl.textContent="无法连接后端服务";});' +
        '</script>';
    return layout('drpy 插件安装', body);
}

function removePageHtml(name) {
    const body =
        '<div class="card"><h2>插件卸载</h2>' +
        '<p>正在卸载插件: ' + (name || '未命名') + '</p>' +
        '<div class="card" id="result"></div>' +
        '<script>' +
        'var resEl=document.getElementById("result");' +
        'fetch("/api/plugin/remove",{' +
        '  method:"POST",headers:{"Content-Type":"application/json"},' +
        '  body:JSON.stringify({name:"' + (name || '') + '"})' +
        '}).then(function(r){return r.json()}).then(function(j){' +
        '  if(j.success){resEl.innerHTML=\'<div class="ok">\\u2714 卸载成功</div>\';}' +
        '  else{resEl.innerHTML=\'<div class="bad">\\u2716 \'+((j.message||"失败")+"".replace(/</g,"&lt;"))+\'</div>\';}' +
        '}).catch(function(){resEl.innerHTML=\'<div class="bad">\\u2716 无法连接后端</div>\';});' +
        '</script>';
    return layout('drpy 插件卸载', body);
}

app.get('/api/plugin/install_page', (req, res) => {
    const { url, name } = req.query;
    if (!url) {
        return res.send(layout('参数错误', '<p>缺少 url 参数</p>'));
    }
    res.type('html').send(installPageHtml(url, name || ''));
});

app.get('/api/plugin/remove_page', (req, res) => {
    const { name } = req.query;
    if (!name) {
        return res.send(layout('参数错误', '<p>缺少 name 参数</p>'));
    }
    res.type('html').send(removePageHtml(name));
});

/* ===== 兼容旧接口 ===== */

app.post('/api/plugin/resolve', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.json({ success: false, message: '缺少 url 参数' });
    }
    try {
        const result = await guangyaParser.resolve(url);
        res.json({ success: true, ...result });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.post('/api/plugin/install', async (req, res) => {
    const { url, name } = req.body;
    if (!url) {
        return res.json({ success: false, message: '缺少 url 参数' });
    }
    try {
        res.json({ success: true, message: '安装任务已开始', taskId: Date.now() });
        const directUrl = await guangyaParser.resolve(url);
        await pluginManager.install({
            url: directUrl.url || url,
            name: name || directUrl.filename || 'plugin_' + Date.now()
        });
    } catch (e) {
        console.error('[Install Error]', e.message);
    }
});

app.post('/api/plugin/install_sync', async (req, res) => {
    const { url, name } = req.body;
    if (!url) {
        return res.json({ success: false, message: '缺少 url 参数' });
    }
    try {
        const directUrl = await guangyaParser.resolve(url);
        const result = await pluginManager.install({
            url: directUrl.url || url,
            name: name || directUrl.filename || 'plugin_' + Date.now()
        });
        res.json({ success: true, message: '安装完成', ...result });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.post('/api/plugin/remove', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.json({ success: false, message: '缺少 name 参数' });
    }
    try {
        await pluginManager.remove(name);
        res.json({ success: true, message: '已卸载: ' + name });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('[drpy-plugin-installer] v1.1.0 服务已启动: http://0.0.0.0:' + PORT);
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log('[drpy-plugin-installer]   局域网地址: http://' + net.address + ':' + PORT);
            }
        }
    }
});