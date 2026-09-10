# -*- coding: utf-8 -*-
"""给指定的 PowerShell 脚本加上 UTF-8 BOM，避免 Windows PowerShell 5.1 按 ANSI 解析导致中文乱码。"""
import io
import os

targets = [
    r"D:\桌面\末世房车MOD工具库\修改器\diagnose_save.ps1",
    r"D:\桌面\末世房车MOD工具库\修改器\诊断存档问题.bat",
]
for t in targets:
    if not os.path.exists(t):
        print("missing:", t)
        continue
    raw = open(t, "rb").read()
    if raw.startswith(b"\xef\xbb\xbf"):
        print("already bom:", os.path.basename(t))
        continue
    text = raw.decode("utf-8")
    with io.open(t, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(text)
    print("bom added:", os.path.basename(t))
