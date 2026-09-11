#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# File  : spider.py
# Author: DaShenHan&道长-----先苦后甜，任凭晚风拂柳颜------
# Author's Blog: https://blog.csdn.net/qq_32394351
# Date  : 2024/1/9
# UpDate  : 2024/1/9 增加多个静态函数以及个性化函数
import hashlib
import re
import json
import zlib
import gzip
import os

import requests
import warnings
import time
from importlib.machinery import SourceFileLoader
from urllib3 import encode_multipart_formdata
from urllib.parse import urljoin, quote, unquote

import base64
import io
import tokenize

try:
    # from com.github.tvbox.osc.util import LOG
    # from com.github.tvbox.osc.util import PyUtil
    from base.hiker import log

    _ENV = 'T3'
    _log = log
except ImportError:
    _ENV = 'T4'
    _log = print

# 关闭警告
warnings.filterwarnings("ignore")
requests.packages.urllib3.disable_warnings()

# ===== 懒加载重模块 =====
# lxml 和 pycryptodome 是 C 扩展, 首次 import 耗时 100-300ms
# 大多数 PY 源不使用 XML 解析 / AES / RSA, 延迟到实际调用时才加载
_etree = None
def _get_etree():
    global _etree
    if _etree is None:
        from lxml import etree
        _etree = etree
    return _etree

_crypto_aes = None
_crypto_unpad = None
def _get_crypto():
    global _crypto_aes, _crypto_unpad
    if _crypto_aes is None:
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import unpad
        _crypto_aes = AES
        _crypto_unpad = unpad
    return _crypto_aes, _crypto_unpad

_crypto_rsa = None
_crypto_pkcs1 = None
def _get_rsa():
    global _crypto_rsa, _crypto_pkcs1
    if _crypto_rsa is None:
        from Crypto.PublicKey import RSA
        from Crypto.Cipher import PKCS1_v1_5 as PKCS1_cipher
        _crypto_rsa = RSA
        _crypto_pkcs1 = PKCS1_cipher
    return _crypto_rsa, _crypto_pkcs1


class BaseSpider:  # 不使用 ABCMeta, 允许源只实现部分方法即可实例化 (兼容 drpy2 标准)
    _instance = None
    _HikerProxyUrl = "http://127.0.0.1:52020/proxy?do=js&hikerSkey="
    ENV: str

    def __init__(self, query_params=None, t4_api=None):
        self.query_params = query_params or {}
        self.t4_api = t4_api or ''
        self.extend = ''
        self.ENV = _ENV
        # self.log(f't4_api:{t4_api}')

    def __new__(cls, *args, **kwargs):
        if cls._instance:
            return cls._instance  # 有实例则直接返回
        else:
            cls._instance = super().__new__(cls)  # 没有实例则new一个并保存
            return cls._instance  # 这个返回是给是给init，再实例化一次，也没有关系

    # # 这是简化的写法，上面注释的写法更容易提现判断思路
    # if not cls._instance:               
    #   cls._instance = super().__new__(cls)
    # return cls._instance

    def init(self, extend=""):
        pass

    def homeContent(self, filter):
        pass

    def homeVideoContent(self):
        pass

    def categoryContent(self, tid, pg, filter, extend):
        pass

    def detailContent(self, ids):
        pass

    def searchContent(self, key, quick, pg=1):
        pass

    def playerContent(self, flag, id, vipFlags):
        pass

    def localProxy(self, params):
        pass

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def getName(self):
        pass

    def init_api_ext_file(self):
        pass

    def getProxyUrl(self):
        """
        获取本地代理地址
        @return:
        """
        if self.ENV.lower() == 't3':
            # return getProxy(True)
            # return PyUtil.getProxy(False)
            # print("海阔代理Base",self._HikerProxyUrl)
            return self._HikerProxyUrl
        elif self.ENV.lower() == 't4':
            return self.t4_api
        else:
            return ''

    def getDependence(self):
        return []

    def setExtendInfo(self, extend):
        self.extend = extend

    def regStr(self, src, reg, group=1):
        m = re.search(reg, src)
        src = ''
        if m:
            src = m.group(group)
        return src

    # cGroup = re.compile('[\U00010000-\U0010ffff]')
    # clean = cGroup.sub('',rsp.text)
    def cleanText(self, src):
        clean = re.sub('[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '',
                       src)
        return clean

    # ==================== HTTP 请求方法 ====================
    # 默认 User-Agent, 部分源站会拒绝没有 UA 的请求 (ConnectionResetError 104)
    _DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    # HTTP 详细日志开关(默认关): 打开后每个请求输出 URL/状态/前200字符, 走 JS 桥有开销
    _DEBUG_HTTP = False
    # 共享连接池会话: keep-alive 复用 TCP/TLS 连接, 同站连续请求省 100-300ms/次
    _session = None

    @classmethod
    def _get_session(cls):
        if cls._session is None:
            from requests.adapters import HTTPAdapter
            s = requests.Session()
            adapter = HTTPAdapter(pool_connections=4, pool_maxsize=8, max_retries=0)
            s.mount('http://', adapter)
            s.mount('https://', adapter)
            cls._session = s
        return cls._session

    def _merge_headers(self, headers):
        """合并 headers, 如果源未设置 User-Agent 则补上默认值"""
        h = dict(headers) if headers else {}
        if not any(k.lower() == 'user-agent' for k in h):
            h['User-Agent'] = self._DEFAULT_UA
        return h

    def _request_with_retry(self, method, url, max_retries=2, **kwargs):
        """带重试的请求封装, 遇到 ConnectionResetError 自动重试; 走共享 Session 复用连接"""
        kwargs['headers'] = self._merge_headers(kwargs.get('headers', {}))
        last_err = None
        s = self._get_session()
        for i in range(max_retries + 1):
            try:
                rsp = s.request(method, url, **kwargs)
                # 保持与原 requests.get/post 一致的无状态语义: 每次请求后清空会话 cookie 罐,
                # 只复用连接池不复用登录态, 避免跨请求串味
                try:
                    s.cookies.clear()
                except Exception:
                    pass
                return rsp
            except (requests.exceptions.ConnectionError, ConnectionResetError) as e:
                last_err = e
                if i < max_retries:
                    time.sleep(0.3 * (i + 1))
                else:
                    raise
        raise last_err

    def fetch(self, url, data=None, params=None, headers={}, cookies="", timeout=5, allow_redirects=True, verify=False, **kwargs):
        # 兼容 drpy2: params= 查询参数(drpy2标准), data= 查询参数(HikerView旧式); 两者择一
        q = params if params is not None else data
        if q is None:
            q = {}
        rsp = self._request_with_retry(
            'GET', url, params=q, headers=headers, cookies=cookies,
            timeout=timeout, verify=verify, allow_redirects=allow_redirects
        )
        rsp.encoding = 'utf-8'
        if self._DEBUG_HTTP:
            try:
                _log(f"[fetch] {url} status={rsp.status_code} len={len(rsp.text)} body={rsp.text[:200]}")
            except:
                pass
        return rsp

    def post(self, url, data=None, headers={}, cookies={}, timeout=5, verify=False, params=None, json=None, **kwargs):
        rsp = self._request_with_retry(
            'POST', url, data=data, params=params, headers=headers,
            cookies=cookies, timeout=timeout, verify=verify, json=json
        )
        rsp.encoding = 'utf-8'
        if self._DEBUG_HTTP:
            try:
                _log(f"[post] {url} json={json is not None} status={rsp.status_code} len={len(rsp.text)} body={rsp.text[:200]}")
            except:
                pass
        return rsp

    def postJson(self, url, json=None, headers={}, cookies={}, timeout=5, verify=False, **kwargs):
        rsp = self._request_with_retry(
            'POST', url, json=json, headers=headers,
            cookies=cookies, timeout=timeout, verify=verify
        )
        rsp.encoding = 'utf-8'
        return rsp

    def postBinary(self, url, data: dict = None, boundary=None, headers={}, cookies={}, timeout=5, verify=False, **kwargs):
        if data is None:
            data = {}
        if boundary is None:
            boundary = f'--dio-boundary-{int(time.time())}'
        headers = self._merge_headers(headers)
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        # print(headers)
        fields = []
        for key, value in data.items():
            fields.append((key, (None, value, None)))
        m = encode_multipart_formdata(fields, boundary=boundary)
        data = m[0]
        rsp = self._request_with_retry(
            'POST', url, data=data, headers=headers,
            cookies=cookies, timeout=timeout, verify=verify
        )
        rsp.encoding = 'utf-8'
        return rsp

    # ==================== 缓存方法 ====================
    # 兼容 drpy2 标准源的 getCache/setCache/deleteCache
    _cache_dir = None

    @classmethod
    def _get_cache_dir(cls):
        if cls._cache_dir is not None:
            return cls._cache_dir
        candidates = [
            '/data/data/com.example.hikerview/cache/spider_cache',
            '/storage/emulated/0/Android/data/com.example.hikerview/files/spider_cache',
            '/storage/emulated/0/tvbox/spider_cache',
            '/tmp/spider_cache',
        ]
        for d in candidates:
            try:
                os.makedirs(d, exist_ok=True)
                test_file = os.path.join(d, '.test')
                with open(test_file, 'w') as f:
                    f.write('1')
                os.remove(test_file)
                cls._cache_dir = d
                return d
            except Exception:
                continue
        cls._cache_dir = ''
        return ''

    def getCache(self, key):
        try:
            d = self._get_cache_dir()
            if not d:
                return ''
            cache_file = os.path.join(d, f'{key}.json')
            with open(cache_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return ''

    def setCache(self, key, value):
        try:
            d = self._get_cache_dir()
            if not d:
                return
            cache_file = os.path.join(d, f'{key}.json')
            with open(cache_file, 'w', encoding='utf-8') as f:
                if isinstance(value, (dict, list)):
                    json.dump(value, f, ensure_ascii=False)
                else:
                    f.write(str(value))
        except Exception:
            pass

    def deleteCache(self, key):
        try:
            d = self._get_cache_dir()
            if not d:
                return
            cache_file = os.path.join(d, f'{key}.json')
            if os.path.exists(cache_file):
                os.remove(cache_file)
        except Exception:
            pass

    def html(self, content):
        return _get_etree().HTML(content)

    def xpText(self, root, expr):
        ele = root.xpath(expr)
        if len(ele) == 0:
            return ''
        else:
            return ele[0]

    def loadModule(self, name, fileName):
        return SourceFileLoader(name, fileName).load_module()

    # ==================== 静态函数 ======================
    def log(self, msg):
        """
        打印日志文本
        @param msg:
        @return:
        """
        if isinstance(msg, dict) or isinstance(msg, list):
            msg = self.json2str(msg)
        else:
            msg = f'{msg}'

        _log(msg)

    @staticmethod
    def isVideo():
        """
        返回是否为视频的匹配字符串
        @return: None空 reg:正则表达式  js:input js代码
        """
        pass

    @staticmethod
    def adRemove():
        """
        m3u8广告移除函数。将自动执行返回的字符串的本地代理功能
        @return: None空 reg:正则表达式  js:input js代码
        """
        pass

    @staticmethod
    def replaceAll(text, mtext, rtext):
        """
        字符串替换全部
        @param text: 原始字符串: 如 xxx.ts
        @param mtext: 匹配想要替换的字符串 如 r'(.*?ts)'
        @param rtext: 用于替换的字符串 如 r'https://www.bdys03.com/\1' 其中\1代表匹配的第1项类似于js的 $1
        @return: 替换后的字符串结果
        """
        return re.sub(mtext, rtext, text)

    @staticmethod
    def str2json(str):
        return json.loads(str)

    @staticmethod
    def json2str(str):
        return json.dumps(str, ensure_ascii=False)

    @staticmethod
    def encodeStr(input, encoding='GBK'):
        """
        指定字符串编码
        :param input:
        :param encoding:
        :return:
        """
        return quote(input.encode(encoding, 'ignore'))

    @staticmethod
    def decodeStr(input, encoding='GBK'):
        """
        指定字符串解码
        :param input:
        :param encoding:
        :return:
        """
        return unquote(input, encoding)

    @staticmethod
    def hexStringTobytes(_str):
        """
        将hex字符串转成byte字节
        @param _str: hex字符串
        @return: byte字节
        """
        _str = _str.replace(" ", "")
        return bytes.fromhex(_str)

    @staticmethod
    def bytesToHexString(_bytes, no_space=True):
        """
        将byte字节转成hex字符串
        @param _bytes: byte字节
        @param no_space: 是否不带空格返回，默认是
        @return: hex字符串
        """
        _str = ''.join(['%02X ' % b for b in _bytes])
        if no_space:
            _str = _str.replace(" ", "")
        return _str

    @staticmethod
    def urljoin(base_url, path):
        """
        链接拼接
        @param base_url: 原链接
        @param path: 路径
        @return: 拼接后的链接
        """
        return urljoin(base_url, path)

    @staticmethod
    def coverDict2form(data: dict):
        """
        字典转form
        @param data:
        @return:
        """
        forms = []
        for k, v in data.items():
            forms.append(f'{k}={v}')
        return '&'.join(forms)

    @staticmethod
    def buildUrl(url: str, obj: dict = None):
        """
        @param url:基础链接可以带query
        @param obj:要更新的query字典。会覆盖基础链接中同名query
        @return:
        """
        if obj is None:
            return url
        if '?' in url:
            old_query = url.split('?')[1]
            old_params = {}
            for text in old_query.split('&'):
                key = text.split('=')[0]
                value = text.split('=')[1]
                old_params[key] = value
        else:
            old_params = {}

        new_obj = old_params.copy()
        new_obj.update(obj)
        param_list = [f'{i}={new_obj[i]}' for i in new_obj]
        prs = '&'.join(param_list)
        if param_list:
            url = url.split('?')[0] + '?' + prs
        return url

    @staticmethod
    def to_lower_camel_case(x):
        """转小驼峰法命名：下划线转驼峰且首字母小写"""
        s = re.sub('_([a-zA-Z])', lambda m: (m.group(1).upper()), x)
        return s[0].lower() + s[1:]

    @staticmethod
    def md5(text):
        """
        md5加密
        @param text: 明文
        @return: 加密结果
        """
        return hashlib.md5(text.encode(encoding='UTF-8')).hexdigest()

    @staticmethod
    def gzinflate(compressed: bytes) -> bytes:
        """
        gzip解压
        @param compressed: 压缩后的字节
        @return:
        """
        return zlib.decompress(compressed, -zlib.MAX_WBITS)

    @staticmethod
    def gzipCompress(compressed: bytes) -> bytes:
        """
        gzip解压
        @param compressed: 压缩后的字节
        @return:
        """
        return gzip.decompress(compressed)

    @staticmethod
    def bytes2stream(some_bytes: bytes):
        """
        字节转文件流
        @param some_bytes:
        @return:
        """
        return io.BytesIO(some_bytes)

    @staticmethod
    def stream2bytes(some_stream):
        """
        文件流转字节
        @param some_stream:
        @return:
        """
        return some_stream.read()

    def skip_bytes(self, some_bytes: bytes, pos=0) -> bytes:
        """
        跳过位置之前的字节并返回
        @param some_bytes:
        @param pos: 待跳过的位置，默认0不跳过
        @return:
        """

        some_stream = self.bytes2stream(some_bytes)
        some_stream.seek(pos)
        return self.stream2bytes(some_stream)

    @staticmethod
    def base64Encode(text):
        """
        base64编码文本
        @param text:
        @return:
        """
        return base64.b64encode(text.encode("utf8")).decode("utf-8")  # base64编码

    @staticmethod
    def base64Decode(text: str):
        """
        base64文本解码
        @param text:
        @return:
        """
        return base64.b64decode(text).decode("utf-8")  # base64解码

    @staticmethod
    def atob(text):
        """
        base64编码文本-同浏览器
        :param text:
        :return:
        """
        return base64.b64decode(text.encode("utf8")).decode("latin1")

    @staticmethod
    def btoa(text):
        """
        base64文本解码-同浏览器
        :param text:
        :return:
        """
        return base64.b64encode(text.encode("latin1")).decode("utf8")

    @staticmethod
    def check_unsafe_attributes(string):
        """
        安全检测需要exec执行的python代码
        :param string:
        :return:
        """
        g = tokenize.tokenize(io.BytesIO(string.encode('utf-8')).readline)
        pre_op = ''
        for toktype, tokval, _, _, _ in g:
            if toktype == tokenize.NAME and pre_op == '.' and tokval.startswith('_'):
                attr = tokval
                msg = "access to attribute '{0}' is unsafe.".format(attr)
                raise AttributeError(msg)
            elif toktype == tokenize.OP:
                pre_op = tokval

    @staticmethod
    def aes_cbc_decode(ciphertext, key, iv):
        """
        aes cbc格式解密
        @param ciphertext:加密的字符串
        @param key: 加密密钥
        @param iv: 加密偏移量
        @return:解密后的文本明文
        """
        AES, unpad = _get_crypto()
        # 将密文转换成byte数组
        ciphertext = base64.b64decode(ciphertext)
        # 构建AES解密器
        decrypter = AES.new(key.encode(), AES.MODE_CBC, iv.encode())
        # 解密
        plaintext = decrypter.decrypt(ciphertext)
        # 去除填充
        plaintext = unpad(plaintext, AES.block_size)
        # 输出明文
        return plaintext.decode('utf-8')

    @staticmethod
    def rsa_private_decode(ciphertext, private_key, default_length=256):
        """
        rsa私钥解密
        @param ciphertext: 加密的字符串
        @param private_key: 私钥
        @param default_length: 分段加密长度,默认256位
        @return: 解密后的文本明文
        """
        RSA, PKCS1_cipher = _get_rsa()
        # 计算需要添加的等号数
        b64_ciphertext = ciphertext
        num_padding = 4 - (len(b64_ciphertext) % 4)
        if num_padding < 4:
            b64_ciphertext += "=" * num_padding
        # 将密文转换成byte数组
        ciphertext = base64.b64decode(b64_ciphertext)
        # 构建RSA解密器
        private_key = f'-----BEGIN RSA PRIVATE KEY-----\n{private_key}\n-----END RSA PRIVATE KEY-----'
        pri_Key = RSA.importKey(private_key)
        decrypter = PKCS1_cipher.new(pri_Key)
        # 解密
        length = len(ciphertext)
        # 长度不用分段
        if length < default_length:
            plaintext = b''.join(decrypter.decrypt(ciphertext, b' '))
        else:
            # 需要分段
            offset = 0
            res = []
            while length - offset > 0:
                if length - offset > default_length:
                    res.append(decrypter.decrypt(ciphertext[offset:offset + default_length], b' '))
                else:
                    res.append(decrypter.decrypt(ciphertext[offset:], b' '))
                offset += default_length

            plaintext = b''.join(res)
        return plaintext.decode('utf-8')

    @staticmethod
    def rsa_public_encode(text, public_key, default_length=256):
        """
        rsa公钥加密
        @param text: 明文
        @param public_key: 公钥
        @param default_length: 分段加密长度默认 256
        @return: 密文
        """
        RSA, PKCS1_cipher = _get_rsa()
        public_key = "-----BEGIN RSA PRIVATE KEY-----\n" + public_key + "\n-----END RSA PRIVATE KEY-----"
        pub_key = RSA.importKey(public_key)
        cipher = PKCS1_cipher.new(pub_key)
        text = text.encode("utf-8)")
        length = len(text)
        if length < default_length:
            rsa_text = base64.b64encode(cipher.encrypt(text))  # 加密并转为b64编码
        else:
            # 需要分段
            offset = 0
            res = []
            while length - offset > 0:
                if length - offset > default_length:
                    res.append(cipher.encrypt(text[offset:offset + default_length]))
                else:
                    res.append(cipher.encrypt(text[offset:]))
                offset += default_length
            byte_data = b''.join(res)

            rsa_text = base64.b64encode(byte_data)

        ciphertext = rsa_text.decode("utf8")
        return ciphertext

    @staticmethod
    def remove_comments(text):
        """
        字符串删除注释
        @param text:带注释的字符串
        @return:
        """

        pattern = re.compile(r'\s*[\'\"]{3}[\S\s]*?[\'\"]{3}')
        text = pattern.sub('', text)
        pattern = re.compile(r'\s*/\*[\S\s]*?\*/')
        text = pattern.sub('', text)
        text = text.splitlines()
        text = [txt for txt in text if not (txt.strip().startswith('//') or txt.strip().startswith('#'))]
        text = '\n'.join(text)
        return text.strip()

    # ==================== 个性化函数 ======================
    def superStr2dict(self, text: str):
        text = self.remove_comments(text)
        localdict = {'true': True, 'false': False, 'null': None}
        self.safe_eval(f'result={text}', localdict)
        result = localdict.get('result') or {}
        return result

    def fixAdM3u8(self, m3u8_text, m3u8_url='', ad_remove=''):
        """
        修复带广告的m3u8文本
        @param m3u8_text: 带广告的m3u8文本
        @param m3u8_url: m3u8原地址链接
        @param ad_remove: 广告去除正则表达式字符串如: reg:/video/adjump(.*?)ts
        @return:
        """
        # ad_remove = 'reg:/video/adjump(.*?)ts'
        if ad_remove.startswith('reg:'):
            ad_remove = ad_remove[4:]
        elif ad_remove.startswith('js:'):
            ad_remove = ad_remove[3:]
        else:
            ad_remove = None

        print(ad_remove)

        # 开头
        m3u8_start = m3u8_text[:m3u8_text.find('#EXTINF')].strip()
        # 中间
        m3u8_body = m3u8_text[m3u8_text.find('#EXTINF'):m3u8_text.find('#EXT-X-ENDLIST')].strip()
        # 结尾
        m3u8_end = m3u8_text[m3u8_text.find('#EXT-X-ENDLIST'):].strip()

        murls = []
        m3_body_list = m3u8_body.splitlines()
        m3_len = len(m3_body_list)
        i = 0
        while i < m3_len:
            mi = m3_body_list[i]
            mi_1 = m3_body_list[i + 1]
            if mi.startswith('#EXTINF'):
                murls.append('&'.join([mi, mi_1]))
                i += 2
            elif mi.startswith('#EXT-X-DISCONTINUITY'):
                mi_2 = m3_body_list[i + 2]
                murls.append('&'.join([mi, mi_1, mi_2]))
                i += 3
            else:
                break
        new_m3u8_body = []
        for murl in murls:
            if ad_remove and self.regStr(murl, ad_remove):
                pass
            else:
                murl_list = murl.split('&')
                if not murl_list[-1].startswith('http') and m3u8_url.startswith('http'):
                    murl_list[-1] = self.urljoin(m3u8_url, murl_list[-1])
                new_m3u8_body.extend(murl_list)

        new_m3u8_body = '\n'.join(new_m3u8_body).strip()
        m3u8_text = '\n'.join([m3u8_start, new_m3u8_body, m3u8_end]).strip()
        return m3u8_text

    def eval_computer(self, text):
        """
        自定义的字符串安全计算器
        @param text:字符串的加减乘除
        @return:计算后得到的值
        """
        localdict = {}
        self.safe_eval(f'ret={text.replace("=", "")}', localdict)
        ret = localdict.get('ret') or None
        return ret

    def safe_eval(self, code: str = '', localdict: dict = None):
        """
        安全执行python代码，返回执行后的数据字典
        @param code: python代码文本
        @param localdict: 待返回字典参数
        @return: localdict
        """
        code = code.strip()
        if not code:
            return {}
        if localdict is None:
            localdict = {}
        builtins = __builtins__
        if not isinstance(builtins, dict):
            builtins = builtins.__dict__.copy()
        else:
            builtins = builtins.copy()
        for key in ['__import__', 'eval', 'exec', 'globals', 'dir', 'copyright', 'open', 'quit']:
            del builtins[key]  # 删除不安全的关键字
        # print(builtins)
        global_dict = {'__builtins__': builtins,
                       'json': json, 'print': print,
                       're': re, 'time': time, 'base64': base64
                       }  # 禁用内置函数,不允许导入包
        try:
            self.check_unsafe_attributes(code)
            exec(code, global_dict, localdict)
            return localdict
        except Exception as e:
            return {'error': f'执行报错:{e}'}
Spider=BaseSpider

# 版本标记: PythonHiker.js 启动时检查此值, 不匹配则强制 reload
_SPIDER_VERSION = "v9.3_session_fastjs"