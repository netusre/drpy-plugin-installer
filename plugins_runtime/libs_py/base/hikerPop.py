from com.lxj.xpopup.interfaces import XPopupCallback
from java import *
from java.util.concurrent import CountDownLatch
from java.lang import Runnable, String
from com.example.hikerview.utils import ThreadTool
from com.lxj.xpopup import XPopup
from com.example.hikerview.service.parser import JSEngine
from com.lxj.xpopup.interfaces import OnConfirmListener,OnInputConfirmListener, OnCancelListener

njs=JSEngine.getInstance()

def empty(*args):
    pass
class newSimpleCallback(dynamic_proxy(XPopupCallback)):
    def __init__(self, *, beforeDismiss=empty, basePopupView=empty, onBackPressed=empty, onCreated=empty, onDismiss=empty, onDrag=empty, onKeyBoardStateChanged=empty, onShow=empty, beforeShow=empty):
        super().__init__()
        self._beforeDismiss=beforeDismiss
        self._basePopupView=basePopupView
        self._onBackPressed=onBackPressed
        self._onCreated=onCreated
        self._onDismiss=onDismiss
        self._onDrag=onDrag
        self._onKeyBoardStateChanged=onKeyBoardStateChanged
        self._onShow=onShow
        self._beforeShow=beforeShow
    def beforeDismiss(self, basePopupView):
        self._beforeDismiss(basePopupView)
    def basePopupView(self, basePopupView):
        self._basePopupView(basePopupView)
    def onBackPressed(self, basePopupView):
        self._onBackPressed(basePopupView)
    def onCreated(self, basePopupView):
        self._onCreated(basePopupView)
    def onDismiss(self, basePopupView):
        self._onDismiss(basePopupView)
    def onDrag(self, basePopupView, value, percent, upOrLeft):
        self._onDrag(basePopupView, value, percent, upOrLeft)
    def onKeyBoardStateChanged(self, basePopupView, height):
        self._onKeyBoardStateChanged(basePopupView, height)
    def onShow(self, basePopupView):
        self._onShow(basePopupView)
    def beforeShow(self, basePopupView):
        self._beforeShow(basePopupView)
    
        

class PyRunnable(dynamic_proxy(Runnable)):
    def __init__(self, runfunc):
        super().__init__()
        self.runfunc=runfunc
    def run(self):
        self.runfunc()
class PyOnConfirmListener(dynamic_proxy(OnConfirmListener)):
    def __init__(self, runfunc):
        super().__init__()
        self.runfunc=runfunc
    def onConfirm(self):
        try:
            self.runfunc()
        except Exception as e:
            print(str(e))
class PyOnInputConfirmListener(dynamic_proxy(OnInputConfirmListener)):
    def __init__(self, runfunc):
        super().__init__()
        self.runfunc=runfunc
    def onConfirm(self, text):
        try:
            self.runfunc(text)
        except Exception as e:
            print(str(e))
class PyOnCancelListener(dynamic_proxy(OnCancelListener)):
    def __init__(self, runfunc):
        super().__init__()
        self.runfunc=runfunc
    def onCancel(self):
        try:
            self.runfunc()
        except Exception as e:
            print(str(e))
def confirmSync(title, content, *,okTitle="确认", cancelTitle="取消", hideCancel=False, noDismissOnBack=True, noDismissOnBlank=True):
    countDownLatch=CountDownLatch(1)
    result = False
    
    def t():
        nonlocal result
        result = True
    xpop=XPopup.Builder(njs.getCurrentActivity(None)).dismissOnTouchOutside(noDismissOnBlank).dismissOnBackPressed(noDismissOnBack).setPopupCallback(newSimpleCallback(onDismiss=lambda *args :countDownLatch.countDown())).asConfirm(title, content, cancelTitle, okTitle,PyOnConfirmListener(t) , None,hideCancel)
    ThreadTool.INSTANCE.runOnUI(PyRunnable(lambda:xpop.show()))
    
    #countDownLatch.await()
    getattr(countDownLatch,"await",None)()
    return result
def inputConfirmSync(title, *, content=None,defaultValue=None, hint=None,noAutoSoft=True, noDismissOnBack=True, noDismissOnBlank=True):
    countDownLatch=CountDownLatch(1)
    result=None
    
    def t(*args):
        nonlocal result
        result=args[0]
    xpop=XPopup.Builder(njs.getCurrentActivity(None)).autoOpenSoftInput(noAutoSoft).autoFocusEditText(noAutoSoft).dismissOnTouchOutside(noDismissOnBlank).dismissOnBackPressed(noDismissOnBack).setPopupCallback(newSimpleCallback(onDismiss=lambda *args :countDownLatch.countDown())).asInputConfirm(title, content, defaultValue, hint, PyOnInputConfirmListener(t) , None,0)
    ThreadTool.INSTANCE.runOnUI(PyRunnable(lambda:xpop.show()))
    
    #countDownLatch.await()
    getattr(countDownLatch,"await",None)()
    return result

def confirm(title, content, *,okTitle="确认", cancelTitle="取消", hideCancel=False, noDismissOnBack=True, noDismissOnBlank=True, ok=empty, cancel=empty):
    xpop=XPopup.Builder(njs.getCurrentActivity(None)).dismissOnTouchOutside(noDismissOnBlank).dismissOnBackPressed(noDismissOnBack).asConfirm(title, content, cancelTitle, okTitle,PyOnConfirmListener(ok) , PyOnCancelListener(cancel), hideCancel)
    ThreadTool.INSTANCE.runOnUI(PyRunnable(lambda:xpop.show()))
def inputConfirm(title, *, content=None,defaultValue=None, hint=None,noAutoSoft=True, noDismissOnBack=True, noDismissOnBlank=True, ok=empty):
    xpop=XPopup.Builder(njs.getCurrentActivity(None)).autoOpenSoftInput(noAutoSoft).autoFocusEditText(noAutoSoft).dismissOnTouchOutside(noDismissOnBlank).dismissOnBackPressed(noDismissOnBack).asInputConfirm(title, content, defaultValue, hint, PyOnInputConfirmListener(ok) , None,0)
    ThreadTool.INSTANCE.runOnUI(PyRunnable(lambda:xpop.show()))
    