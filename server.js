const express = require('express');
const cors = require('cors');
const path = require('path');
const pluginManager = require('./pluginManager');
const guangyaParser = require('./guangyaParser');

const app = express();
const PORT = process.env.PORT || 5800;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        name: 'drpy-plugin-installer',
        version: '1.0.0',
        status: 'running',
        endpoints: [
            'GET  /api/plugin/status',
            'POST /api/plugin/install',
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
        res.json({ success: true, message: '安装任务已开始，请通过状态接口查询进度', taskId: Date.now() });

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
    console.log(`[drpy-plugin-installer] 服务已启动: http://0.0.0.0:${PORT}`);
    console.log(`[drpy-plugin-installer] 局域网访问: http://<你的IP>:${PORT}`);
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`[drpy-plugin-installer]   -> http://${net.address}:${PORT}`);
            }
        }
    }
});
