from base.hiker import *
import base.hikerPop as hp
def holle():
    return "pyfun成功"

def my_function(a, b, d=5,c=3):
    return a + b + c+d

def main():
    #调用js注册的函数jsFun
    jsFun([8,(7,9), {8,9,10}],{"c":1,"d":"ff"}, holle)()
    test_hiker_sync_pop()
    test_hiker_pop()
    return "ok"

def my_function2(obj):
    print(obj["k"])

def test_hiker_sync_pop():
    if hp.confirmSync("f","ffff"):
        print(hp.inputConfirmSync("请输入"));
def test_hiker_pop():
    hp.confirm("f","ffff", ok=lambda: hp.inputConfirm("请输入", ok=lambda t:print(t)))
        