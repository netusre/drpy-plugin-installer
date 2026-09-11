const fetch = require('node-fetch');

const GUANGYA_API = 'https://www.guangyapan.com';

async function resolve(shareUrl) {
    console.log(`[GuangyaParser] 解析链接: ${shareUrl}`);

    const idMatch = shareUrl.match(/\/s\/(\d+)_([a-zA-Z0-9]+)/);
    if (!idMatch) {
        throw new Error('无法识别的光鸭云盘链接格式');
    }

    const fileId = idMatch[1];
    const fileToken = idMatch[2];
    console.log(`[GuangyaParser] 文件ID: ${fileId}, Token: ${fileToken}`);

    try {
        const infoResp = await fetch(`${GUANGYA_API}/api/v2/share/info/${fileId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': shareUrl
            },
            timeout: 15000
        });

        if (infoResp.ok) {
            const info = await infoResp.json();
            console.log(`[GuangyaParser] 文件信息:`, JSON.stringify(info).substring(0, 200));

            if (info.data && info.data.download_url) {
                return {
                    url: info.data.download_url,
                    filename: info.data.name || info.data.filename || `plugin_${fileId}`,
                    size: info.data.size || 0
                };
            }
        }
    } catch (e) {
        console.log(`[GuangyaParser] API方式失败: ${e.message}`);
    }

    try {
        const pageResp = await fetch(shareUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        const html = await pageResp.text();

        const downloadMatch = html.match(/download_url['":\s]+['"]?(https?:\/\/[^'")\s]+)/i)
            || html.match(/href=['"]?(https?:\/\/[^'"]*(?:download|dl)[^'"]*)/i)
            || html.match(/window\.location\s*=\s*['"]?(https?:\/\/[^'"]+)/i);

        if (downloadMatch) {
            return {
                url: downloadMatch[1],
                filename: `plugin_${fileId}`,
                size: 0
            };
        }
    } catch (e) {
        console.log(`[GuangyaParser] 页面解析失败: ${e.message}`);
    }

    throw new Error(
        '自动解析失败。请手动获取下载直链，然后通过后端直接传入直链安装。\n' +
        '手动方式: 在浏览器打开分享链接，获取文件直链后，POST /api/plugin/install_sync { "url": "直链" }'
    );
}

module.exports = { resolve };
