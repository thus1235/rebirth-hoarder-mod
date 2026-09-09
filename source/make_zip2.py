# -*- coding: utf-8 -*-
# 打包分享包（UTF-8 文件名 + 正斜杠路径）—— 显式参数版
# 用法: python make_zip2.py <源目录> <输出zip>
import os, zipfile, sys

src = sys.argv[1]
out = sys.argv[2]

zf = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
count = 0
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in ('rh_backups', 'patched')]
    for f in files:
        if f.endswith('.zip') or f.endswith('.log') or f in ('rh_editor_lang.txt', 'rh_recent_items.txt', 'rh_editor.log'):
            continue
        full = os.path.join(root, f)
        rel = os.path.relpath(full, src).replace(os.sep, '/')
        zf.write(full, rel)
        count += 1
zf.close()
z = zipfile.ZipFile(out)
for n in z.namelist():
    print(n)
print('files:', len(z.namelist()), 'raw bytes:', sum(i.file_size for i in z.infolist()))
