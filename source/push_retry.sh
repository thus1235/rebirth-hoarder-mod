#!/bin/bash
# push_retry.sh - 重试获取凭证并推送（GCM 偶发挂起，多试几次）
cd "/d/桌面/末世房车MOD工具库/github_repo" || exit 1
CREDS=""
for i in 1 2 3 4 5 6 7 8; do
  CREDS=$(printf "protocol=https\nhost=github.com\n\n" | GCM_TRACE=1 timeout 30 git credential fill 2>/dev/null)
  ULEN=$(printf "%s\n" "$CREDS" | sed -n 's/^username=//p' | wc -c)
  PLEN=$(printf "%s\n" "$CREDS" | sed -n 's/^password=//p' | wc -c)
  echo "[try $i] creds_len=${#CREDS} u_len=$ULEN p_len=$PLEN"
  if [ "$ULEN" -gt 1 ] && [ "$PLEN" -gt 1 ]; then
    U=$(printf "%s\n" "$CREDS" | sed -n 's/^username=//p')
    P=$(printf "%s\n" "$CREDS" | sed -n 's/^password=//p')
    B64=$(printf "%s" "$U:$P" | base64 -w0)
    echo "[$i] 获取凭证成功，开始推送..."
    timeout 120 git -c "http.https://github.com/.extraheader=Authorization: Basic $B64" push origin main 2>&1 | grep -v "Authorization"
    RC=${PIPESTATUS[0]}
    echo "[$i] push exit=$RC"
    if [ "$RC" = "0" ]; then
      echo "PUSH_OK"
      exit 0
    fi
  else
    echo "[$i] 未取到凭证，2 秒后重试"
    sleep 2
  fi
done
echo "PUSH_FAILED"
exit 1
