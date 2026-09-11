from com.example.hikerview.service.parser import JSEngine
njs=JSEngine.getInstance()
import java
import json
from com.alibaba.fastjson import JSON
import sys
import app

MY_RULE = None

def _getRule():
    global MY_RULE
    if MY_RULE==None:
        MY_RULE = JSON.parseObject(my_rule);
    return MY_RULE;
    
def _dictToJSONObject(dic):
    return JSON.parseObject(json.dumps(dic))

def log(*objects, sep=' ', end='\n', file = sys.stdout, flush=False):
    #输出到文件大概用不到先不实现
    output = sep.join(map(str, objects))
    output += end
    njs.log(MY_TITLE+":"+output, None)


def parseDom(html, rule):
    return str(njs.parseDom(html, rule))

def parseDomForArray(html, rule):
    return json.loads(njs.parseDomForArray(html, rule))

def parseDomForHtml(html, rule):
    return str(njs.parseDomForHtml(html, rule))

def toast(info):
    njs.toast(str(info), MY_TICKET)
    
def fetch(url, options={}):
    return str(njs.fetch(url, _dictToJSONObject(options), _getRule()))
    
def setHomeResult(data):
    njs.setHomeResult(app.toNativeJsObject(data), CALLBACK_KEY, _getRule(), "home")

def setSearchResult(data):
    njs.setSearchResult(app.toNativeJsObject(data), CALLBACK_KEY, _getRule(), "search")

