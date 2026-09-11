# drpy-plugin-installer

在**海阔视界 Hiker 小程序内**一键静默安装 Python 扩展插件到海阔本地目录。

**纯小程序方案，不需要电脑端服务、不依赖局域网。**

## 原理

- 插件包 `PythonExtensionPlugin_v12.hkpkg`（约 12MB）托管在本仓库 `plugins/` 下；
- 海阔小程序通过 `downloadFile(GitHub直链, 'hiker://files/drpy/plugins/...')` 静默下载；
- 点击 = 下载 = 落盘，完成即安装；
- jsDelivr CDN 直链为主，raw.githubusercontent 直链为备用，自动回退。

直链：

| 源 | 地址 |
|----|------|
| jsDelivr（主） | `https://cdn.jsdelivr.net/gh/netusre/drpy-plugin-installer@master/plugins/PythonExtensionPlugin_v12.hkpkg` |
| GitHub raw（备） | `https://raw.githubusercontent.com/netusre/drpy-plugin-installer/master/plugins/PythonExtensionPlugin_v12.hkpkg` |

## 使用

### 方式一：导入现成小程序（推荐）

1. 下载 `插件安装版.hkzip`；
2. 海阔视界 → 首页左上角菜单 → 导入小程序 → 选择该 `.hkzip`；
3. 首页出现「Python插件一键安装」卡片；
4. 点击 → 进入安装页 → 点击「一键安装」，静默下载完成后状态变为「已安装」。

安装目标：`hiker://files/drpy/plugins/PythonExtensionPlugin_v12.hkpkg`（DrpyHiker 插件目录）。

### 方式二：合并进现有规则

用 `rule_hacker/rule_modified.json` 替换你现有 rule.json 的规则内容（该文件已内置
`plugininstall` 与 `pluginrun` 两个页面，首页含「Python插件一键安装」入口卡片），导入海阔即可。

## 更新插件

插件有新版时，把新 `.hkpkg` 放到 `plugins/`（保持 `PythonExtensionPlugin_v12.hkpkg` 文件名），
`git push` 后，海阔里点「已安装 → 重新安装」即静默覆盖更新。变更文件后建议在 jsDelivr 加一次
刷新（`https://purge.jsdelivr.net/gh/...`）或等待几分钟。

## 目录结构

```
drpy-plugin-installer/
├── plugins/
│   └── PythonExtensionPlugin_v12.hkpkg   # 插件包（GitHub 直链源）
├── rule_hacker/
│   ├── rule_plugin.json                  # 纯插件安装页面（独立/合并用）
│   ├── rule_modified.json                # 完整 rule.json（含插件页面，导入用）
│   └── out/rule.json                     # 打包产物
├── build_rule.js                         # 规则生成脚本（Node）
├── server.js / pluginManager.js / guangyaParser.js   # 旧版后端(已弃用,仅供参考)
└── README.md
```

## 关于旧版后端

仓库早期版本提供过 Node.js 后端服务（`node server.js`，端口 5800）来实现安装。该方案已被
纯小程序方案取代，相关代码（`server.js`、`pluginManager.js`、`guangyaParser.js`）保留仅供
参考，不再需要运行。

> 注：插件原始来自光鸭云盘分享，但该分享被分享者设为「需登录下载」，无法免登录静默获取，
> 因此改用本仓库 GitHub 直链托管。