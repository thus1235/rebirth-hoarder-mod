# -*- coding: utf-8 -*-
# 打包 v3.18 分享包（UTF-8 文件名 + 正斜杠路径，排除 rh_backups/zip/log）
import os, zipfile, sys

src = sys.argv[1] if len(sys.argv) > 1 else r'修改器'
out = sys.argv[2] if len(sys.argv) > 2 else r'分享包/末世房车MOD-v3.18-20260906.zip'
base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 工具库根目录
src = os.path.join(base, src)
out = os.path.join(base, out)

zf = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
count = 0
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d != 'rh_backups']
    for f in files:
        if f.endswith('.zip') or f.endswith('.log') or f in ('rh_editor_lang.txt','rh_recent_items.txt','rh_editor.log'):
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
