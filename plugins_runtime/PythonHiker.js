const mpath = "hiker://files/plugins/chaquopy"

function getMP(name) {
    return mpath + "/" + name;
}

function initPython() {
    initChaquopy(getMP("chaquopy.apk"));
    findJavaClass(getMP("classes.dex"), 'com.chaquo.python.android.AndroidPlatform', getMP('arm64-v8a'));
}
initPython();


const FileUtil = com.example.hikerview.utils.FileUtil;
const File = java.io.File;
const Integer = java.lang.Integer;

let AndroidPlatform = new org.mozilla.javascript.NativeJavaClass(this, findJavaClass("com.chaquo.python.android.AndroidPlatform"));
let Python = new org.mozilla.javascript.NativeJavaClass(this, findJavaClass("com.chaquo.python.Python"));
let PyObject = new org.mozilla.javascript.NativeJavaClass(this, findJavaClass("com.chaquo.python.PyObject"));
let Kwarg = new org.mozilla.javascript.NativeJavaClass(this, findJavaClass("com.chaquo.python.Kwarg"));

if (!Python.isStarted()) {
    let androidPlatform = new AndroidPlatform(getCurrentActivity())
    Python.start(androidPlatform);

    let sys = Python.getInstance().getModule("sys");
    // 启用 .pyc 字节码缓存, 加速二次加载
    sys.put("dont_write_bytecode", false);
    let spath = sys.get("path").asList();
    spath.add(spath.size(), PyObject.fromJava(getPath(getMP("libs_py")).slice(7)))
}


let py = Python.getInstance();

let machinery = py.getModule("importlib.machinery");

// 缓存 sys 模块引用, runPy 中用于检查模块是否已加载
let _sysMod = py.getModule("sys");

// 初始化时尝试清除 base.spider 缓存 (使用 execCode 代替 _pyEval)
// 注意: 此时 evalCode/execCode 尚未定义, 使用 call_global_function 直接调用
let _appMod0 = py.getModule("app");
var _cacheDebug = [];
try {
    _appMod0.callAttr("call_global_function", ["exec",
        "import sys as _s\n" +
        "_before = 'base.spider' in _s.modules\n" +
        "if _before:\n" +
        "    _s.modules.pop('base.spider', None)\n" +
        "    _s.modules.pop('base_spider', None)\n" +
        "_after = 'base.spider' in _s.modules\n"
    ]);
    _cacheDebug.push("init clear done");
} catch(e) {
    _cacheDebug.push("init clear error: " + String(e));
}

let Builtins = py.getBuiltins();

//构建海阔环境模块
let hiker = py.getModule("base.hiker");
hiker.put("MY_TITLE", MY_RULE.title || "");
hiker.put("MY_TICKET", MY_TICKET);
hiker.put("CALLBACK_KEY", CALLBACK_KEY);
hiker.put("my_rule", JSON.stringify(MY_RULE));


let NativePyApp = py.getModule("app");
//let NativePyApp = machinery.callAttr("SourceFileLoader", "app", getPath(getMP("libs_py/application/json.py")).slice(7)).callAttr("load_module");


function evalCode(...args) {
    return NativePyApp.callAttr("call_global_function", ["eval"].concat(args));
}

function execCode(...args) {
    return NativePyApp.callAttr("call_global_function", ["exec"].concat(args));
}

function wrapperJsFunc(func) {
    return NativePyApp.callAttr("wrapper_jsfunc", [func]);
}

function wrapperPyFunc(pyObject) {
    return function(...arr) {
        arr = arr.map(v => fromJs(v));
        return pyToJs(pyObject.call(arr));
    }
}

function callFunc(pyObject, name, ...arr) {
    arr = arr.map(v => fromJs(v));
    return pyToJs(pyObject.callAttr(name, arr));
}

function pyToJs(pyObject) {
    if (pyObject == null) {
        return null;
    }
    let type = String(pyObject.type().toString()).replace("<class '", "").replace("'>", "");
    if (type === "list" || type === "tuple" || type === "set") {
        if (type === "set") {
            pyObject = Builtins.callAttr("list", [pyObject]);
        }
        // 大列表优先用 JSON 一次性序列化, 避免逐元素跨桥调用
        try {
            return JSON.parse(NativePyApp.callAttr("json_stringify", [pyObject]).toString());
        } catch(e) {
            // 回退: 逐元素转换 (处理含自定义对象的列表)
            let arr = [];
            let list = pyObject.asList();
            let size = list.size();
            for (let i = 0; i < size; i++) {
                arr.push(pyToJs(list.get(i)));
            }
            return arr;
        }
    } else if (type === "int" || type === "float") {
        return Number(pyObject.toDouble());
    } else if (type === "bool") {
        return Boolean(pyObject.toBoolean());
    } else if (type === "dict") {
        // 大字典同样优先用 JSON 序列化
        try {
            return JSON.parse(NativePyApp.callAttr("json_stringify", [pyObject]).toString());
        } catch(e) {
            let obj = {};
            for (let item of pyObject.asMap().entrySet()) {
                obj[String(item.getKey().toString())] = pyToJs(item.getValue());
            }
            return obj;
        }
    } else if (type === "str") {
        return String(pyObject.toString());
    } else if (type === "function") {
        return wrapperPyFunc(pyObject);
    } else {
        try {
            let clazz = java.lang.Class.forName(type, javaLoader);
            if (clazz !== null) {
                return pyObject.toJava(clazz);
            }
        } catch (e) {

        }
    }
    return pyObject;
}

function toJson(pyObj) {
    return JSON.parse(NativePyApp.callAttr("json_stringify", [pyObj]).toString());
}

function toPyJson(json) {
    return NativePyApp.callAttr("json_parse", [JSON.stringify(json)]);
}
const cPath = getPath("hiker://files/_cache/py/").slice(7);

function runPy(path, mname, nocache) {
    let name = "";
    let mpath = "";
    if (path.startsWith("http")) {
        if (path.endsWith(".py")) {
            name = path.split("/").pop().split(".")[0];
        } else {
            name = md5(path);
        }
    } else {
        let pa = path.split("/");
        name = pa.pop().split(".")[0];
    }
    let modName = mname || name;
    // 【缓存前置】先查 sys.modules: 已加载模块直接返回, 不再先复制/下载文件
    // (原实现本地文件每次都 FileUtil.copy 一遍, 远程也先走下载缓存检查, 纯属浪费 I/O)
    // nocache=true 时清缓存强制重载
    if (nocache) {
        try {
            execCode("import sys; sys.modules.pop('" + modName.replace(/'/g, "\\'") + "', None); sys.modules.pop('base.spider', None); sys.modules.pop('base_spider', None)");
        } catch(e) {}
    } else {
        let modules = _sysMod.get("modules");
        if (modules.containsKey(modName)) {
            return modules.get(modName);
        }
    }
    if (path.startsWith("http")) {
        if(nocache){
           downloadFile(path, (mpath = cPath + modName + ".py"));
        }else {
           requireDownload(path, (mpath = cPath + modName + ".py"));
        }
    } else {
        mpath = cPath + name + ".py";
        FileUtil.copy(new File(path), new File(mpath));
    }
    return machinery.callAttr("SourceFileLoader", modName, mpath).callAttr("load_module");
}

function fromJs(obj) {
    let type = Object.prototype.toString.call(obj)
    if ("[object Array]" === type || "[object Object]" === type) {
        // 【快通道】大数组/大字典走 JSON 一次性转换 (1 次桥调用), 避免逐元素跨桥
        // (原实现每个元素 1 次 append/update 桥调用, 几百条的列表要几百次桥往返)
        // 注: JSON 序列化会丢弃函数/undefined——大载荷几乎都是纯数据, 小对象仍走逐元素
        // 精确路径以保留函数包装等语义; 异常时回退逐元素
        try {
            let s = JSON.stringify(obj);
            if (s && s.length >= 512) {
                return NativePyApp.callAttr("json_parse", [s]);
            }
        } catch (e) {}
        if ("[object Array]" === type) {
            let list = Builtins.callAttr("list");
            for (let value of obj) {
                list.callAttr("append", fromJs(value));
            }
            return PyObject.fromJava(list);
        } else {
            let dict = Builtins.callAttr("dict");
            for (let [key, value] of Object.entries(obj)) {
                dict.callAttr("update", Kwarg(String(key), fromJs(value)));
            }
            return dict;
        }
    } else if ("[object Undefined]" === type || "[object Null]" === type) {
        return null;
    } else if ("[object Function]" === type) {
        return wrapperJsFunc(obj);
    } else if ("[object Date]" === type) {
        return obj.getTime();
    } else if ("[object Set]" === type) {
        let set = Builtins.callAttr("set");
        for (let value of obj) {
            set.callAttr("add", fromJs(value));
        }
        return set;
    } else if ("[object Map]" === type) {
        let dict = Builtins.callAttr("dict");
        for (let [key, value] of obj.entries()) {
            dict.callAttr("update", Kwarg(String(key), fromJs(value)));
        }
        return dict;
    }
    /* else if("[object Number]"===type&&isInteger(obj)){
            return new Integer(obj);
    }*/
    return obj;
    //return PyObject.fromJava(obj);
}

function isInteger(obj) {
    return ~~obj == obj
}

function toInt(num) {
    return new Integer(num);
}
Builtins.put("print", hiker.get("log"));
// 输出缓存清理调试日志 (通过 Python print, JavaScript 中无 print 函数)
_cacheDebug.forEach(function(msg) {
    try { execCode("print('[cache] " + msg.replace(/'/g, "\\'") + "')"); } catch(e) {}
});
$.exports = {
    PyObject,
    Kwarg,
    callFunc,
    evalCode,
    execCode,
    runPy,
    toJson,
    toPyJson,
    Builtins,
    wrapperJsFunc,
    pyToJs,
    fromJs,
    toInt
}