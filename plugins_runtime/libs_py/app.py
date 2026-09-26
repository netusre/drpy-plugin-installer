import json
import builtins
from org.mozilla.javascript import Context as JSContext, Function, NativeJavaMap, NativeArray, NativeObject
from com.chaquo.python import PyObject
from base.hiker import *
from java import *


def json_parse(content):
    return json.loads(content)

def json_stringify(data):
    return json.dumps(data, ensure_ascii=False)


def call_function_to_jsonstr(mo, func_name,*args, **kwargs):
    return json_stringify(call_function(mo,func_name,*args, **kwargs))

def call_function(mo, func_name,*args, **kwargs):
    func = getattr(mo,func_name,None)
    if func and callable(func):
        return func(*args, **kwargs)
    else:
        raise ValueError(f"Function {func_name} not found in module")

def call_global_function(func_name,*args, **kwargs):
    return call_function(builtins,func_name,*args, **kwargs)

def wrapper_jsfunc(jsFunc):
    def wrapper(*args):
        args = list(args)
        jscontext = JSContext.getCurrentContext()
        scope = jsFunc.getParentScope()
        for i, k in enumerate(args):
            args[i] = toJsObject(k, scope, jscontext)
        ret = jsFunc.call(jscontext, None, None, args)
        if(type(ret)==NativeJavaMap):
            return ret.unwrap()
        return ret;
    return wrapper


def toJsObject(data, scope, jscontext):
    data_type = type(data)
    if data_type == list or data_type==tuple or data_type==set:
        return jscontext.newArray(scope, [toJsObject(item, scope, jscontext) for item in data])
    elif data_type == dict:
        jsObject = jscontext.newObject(scope)
        for key, value in data.items():
            jsObject.put(str(key), jsObject, toJsObject(value, scope, jscontext))
        return jsObject
    elif callable(data):
        return PyFunction(data, scope, jscontext)
    return data

def toNativeJsObject(data):
    data_type = type(data)
    if data_type == list or data_type==tuple or data_type==set:
        return NativeArray([toNativeJsObject(item) for item in data])
    elif data_type == dict:
        jsObject = NativeObject()
        for key, value in data.items():
            jsObject.put(str(key), jsObject, toNativeJsObject(value))
        return jsObject
    #elif callable(data):
    #    return PyFunction(data)
    return data

class PyFunction(dynamic_proxy(Function)):
    def __init__(self, pyFunc, scope, jscontext):
        super().__init__()
        self.pyFunc=pyFunc
        self.scope=scope
        self.jscontext=jscontext
    def call(self, context, scriptable, scriptable2, objArr):
        return toJsObject(self.pyFunc(*objArr), self.scope, self.jscontext)
    def construct(self, scriptable, objArr):
        pass
    def getParentScope(self):
        return self.scope