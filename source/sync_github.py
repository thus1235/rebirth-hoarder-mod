# -*- coding: utf-8 -*-
"""把工具库最新内容同步到 github_repo（等价于 发布GitHub.ps1 的第 2 步，不含 git 操作）。

沙箱环境下 PowerShell 的 Remove-Item -Recurse 会被拦截，这里用 Python 完成同样的整理。
"""
import os
import shutil

ROOT = r"D:\桌面\末世房车MOD工具库"
GH = os.path.join(ROOT, "github_repo")
MOD_SRC = os.path.join(ROOT, "修改器")
DEV_SRC = os.path.join(ROOT, "开发源码")
CS_SRC = os.path.join(ROOT, "源代码", "存档修改器-源代码")
SHARE = os.path.join(ROOT, "分享包")

SKIP_NAMES = {"诊断报告.txt", "rh_editor_lang.txt", "rh_recent_items.txt", "rh_editor.log"}
SKIP_EXT = {".log", ".zip"}


def reset_dir(d):
    if os.path.isdir(d):
        shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)


def copy_files(src, dst, skip_zip=False):
    os.makedirs(dst, exist_ok=True)
    n = 0
    for f in sorted(os.listdir(src)):
        full = os.path.join(src, f)
        if not os.path.isfile(full):
            continue
        if f in SKIP_NAMES or f.startswith(".__"):
            continue
        if os.path.splitext(f)[1].lower() in SKIP_EXT:
            continue
        if skip_zip and f.lower().endswith(".zip"):
            continue
        shutil.copy2(full, os.path.join(dst, f))
        n += 1
    return n


# --- mod ---
mod_dst = os.path.join(GH, "mod")
reset_dir(mod_dst)
n1 = copy_files(MOD_SRC, mod_dst, skip_zip=True)
# 需要一并同步的子目录
for sub in ("mod_src", "patched"):
    d = os.path.join(MOD_SRC, sub)
    if os.path.isdir(d):
        n1 += copy_files(d, os.path.join(mod_dst, sub))

# 分享包：取 末世房车MOD-v*.zip 里最新的一个
zips = [f for f in os.listdir(SHARE) if f.startswith("末世房车MOD-v") and f.endswith(".zip")]
if zips:
    zips.sort(key=lambda f: os.path.getmtime(os.path.join(SHARE, f)), reverse=True)
    shutil.copy2(os.path.join(SHARE, zips[0]), os.path.join(mod_dst, zips[0]))
    print("分享包:", zips[0])

# --- source ---
src_dst = os.path.join(GH, "source")
reset_dir(src_dst)
n2 = copy_files(DEV_SRC, src_dst, skip_zip=True)
if os.path.isdir(os.path.join(DEV_SRC, "rh_src")):
    n2 += copy_files(os.path.join(DEV_SRC, "rh_src"), os.path.join(src_dst, "rh_src"))
if os.path.isdir(CS_SRC):
    n2 += copy_files(CS_SRC, os.path.join(src_dst, "csharp-src"))

print("mod 文件:", n1, " source 文件:", n2)
