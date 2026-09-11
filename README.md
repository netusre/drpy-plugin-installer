# drpy-plugin-installer

drpy Python插件一键安装服务，配合海阔视界Hiker小程序使用。

## 功能

- 一键安装 Python 扩展插件到 drpy 后端
- 支持光鸭云盘分享链接自动解析
- 自动下载、解压、安装 pip 依赖
- 插件管理（查看/卸载）
- 局域网内可通过 Hiker 小程序远程操作

## 快速开始

### 1. 安装依赖

```bash
cd drpy-plugin-installer
npm install
```

### 2. 启动服务

```bash
node server.js
```

启动后会显示局域网访问地址，如 `http://192.168.1.100:5800`

### 3. 在 Hiker 小程序中使用一键安装

1. 将 `rule_hacker/rule_modified.json` 替换为你现有的 rule.json（首页会新增「Python插件一键安装」入口卡片）
2. 导入海阔视界后，进入首页点击「[ Python插件一键安装 ]」卡片
3. 在安装页面点击「[ 一键安装 ]」，会自动打开后端的安装进度页，实时显示下载/解压/装依赖日志
4. 安装完成后回到小程序页面，状态变为「已安装」，可随时重新安装或卸载

> 服务器地址默认 `http://127.0.0.1:5800`。手机与后端不在同一设备时，将 rule 中
> `plugin_server_url` 的默认值改为电脑局域网 IP，例如 `http://192.168.1.100:5800`
> （页面内同样会展示当前地址，便于核对）。

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `GET /` | GET | 服务状态 |
| `GET /api/plugin/status` | GET | 查看已安装插件 |
| `POST /api/plugin/start` | POST | 创建安装任务（返回 taskId） |
| `GET /api/plugin/task?id=xxx` | GET | 查询任务进度/日志 |
| `GET /api/plugin/install_page?url=&name=` | GET | 安装网页（Hiker 按钮打开） |
| `GET /api/plugin/remove_page?name=` | GET | 卸载网页（Hiker 按钮打开） |
| `POST /api/plugin/install` | POST | 异步安装插件 |
| `POST /api/plugin/install_sync` | POST | 同步安装（等待完成） |
| `POST /api/plugin/remove` | POST | 卸载插件 |
| `POST /api/plugin/resolve` | POST | 解析分享链接获取直链 |

### 安装插件示例

```bash
# 解析光鸭云盘链接
curl -X POST http://127.0.0.1:5800/api/plugin/resolve \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.guangyapan.com/s/1945414759732711521_ae4AhIULFG4aU285"}'

# 一键安装（异步）
curl -X POST http://127.0.0.1:5800/api/plugin/install \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.guangyapan.com/s/1945414759732711521_ae4AhIULFG4aU285", "name": "PythonExtensionPlugin_v12"}'

# 一键安装（同步，等待完成）
curl -X POST http://127.0.0.1:5800/api/plugin/install_sync \
  -H "Content-Type: application/json" \
  -d '{"url": "https://直链地址/file.zip", "name": "PythonExtensionPlugin_v12"}'

# 查看已安装插件
curl http://127.0.0.1:5800/api/plugin/status

# 卸载插件
curl -X POST http://127.0.0.1:5800/api/plugin/remove \
  -H "Content-Type: application/json" \
  -d '{"name": "PythonExtensionPlugin_v12"}'
```

## 目录结构

```
drpy-plugin-installer/
├── server.js              # Express 主服务
├── pluginManager.js       # 插件管理模块（下载/解压/安装）
├── guangyaParser.js       # 光鸭云盘链接解析
├── package.json
├── rule_hacker/
│   ├── rule_plugin.json        # 插件安装页面（独立小程序）
│   └── rule_modified.json      # 原始rule.json + 插件页面（合并版）
├── plugins/               # 插件安装目录（自动创建）
├── temp/                  # 临时下载目录（自动创建）
└── README.md
```

## 注意事项

- 服务默认端口 `5800`，可通过 `PORT` 环境变量修改
- 需要 Node.js >= 14
- 插件安装需要后端有 Python 环境（用于 pip install）
- 光鸭云盘自动解析可能不稳定，建议优先使用直链
