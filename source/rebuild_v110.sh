#!/bin/bash
# rebuild_v110.sh - 重建并部署 v1.10
set -e
cd "D:/桌面/末世房车MOD工具库/开发源码"
NODE="C:/Users/Thus/.workbuddy/binaries/node/versions/22.22.2-2/node.exe"
ASAR="D:/桌面/末世：我有一辆房车/resources/app.asar.bak"
for f in "AppContent-1b606631.js" "index-eb28ac05.js" "TowerExploration-9a03b57e.js"; do
  "$NODE" asar_tool.js extract "$ASAR" "dist_steam/assets/$f" "_work/$f" 2>/dev/null || echo "extract fail $f"
done
TE="_work/TowerExploration-9a03b57e.js"
IDX="_work/index-eb28ac05.js"
AC="_work/AppContent-1b606631.js"
"$NODE" rh_src/apply_patches.js "$TE" >/dev/null
"$NODE" rh_src/apply_patch2.js "$TE" >/dev/null
"$NODE" rh_src/apply_patch3.js "$IDX" >/dev/null
"$NODE" rh_src/apply_patch4.js "$TE" >/dev/null
"$NODE" rh_src/apply_patch5.js "$TE" >/dev/null
"$NODE" rh_src/apply_patch6.js "$TE" >/dev/null
"$NODE" rh_src/apply_eco.js "$AC" >/dev/null
echo "补丁完成"
"$NODE" -e '
const fs=require("fs");
const ac=fs.readFileSync("_work/AppContent-1b606631.js","utf8");
const ix=fs.readFileSync("_work/index-eb28ac05.js","utf8");
const c=[["plantAll注入",ac.includes("plantAll: function ()")],["ripenAll保留",ac.includes("ripenAll: function ()")],["面板v1.11",ix.includes("v1.11")],["种植按钮",ix.includes("data-act=\"ecoPlant\"")],["空态引导文案",ix.includes("先点「一键种植」再点「一键催熟」")]];
let ok=true;for(const[n,p] of c){console.log((p?"[OK]  ":"[FAIL] ")+n);if(!p)ok=false;}
process.exit(ok?0:1);'
mkdir -p _work/syn
for f in _work/*-*.js; do
  b=$(basename "$f" .js)
  cp "$f" "_work/syn/$b.mjs"
  "$NODE" --check "_work/syn/$b.mjs" && echo "语法OK: $b"
done
cd "D:/桌面/末世房车MOD工具库"
for f in TowerExploration-9a03b57e.js index-eb28ac05.js AppContent-1b606631.js; do
  cp "开发源码/_work/$f" "修改器/patched/$f"
  cp "修改器/patched/$f" "D:/桌面/末世：我有一辆房车/resources/app/dist_steam/assets/$f"
done
echo "部署完成"
