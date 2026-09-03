// 末世：我有一辆房车 - 存档修改器（免环境版 v2.0）
// 单文件 WinForms，仅依赖系统自带 .NET Framework 4.x（Win10/11 内置），无需安装任何环境。
// 校验和算法与游戏 saveCodecV2.cjs 及原 Python 版完全一致：
//   checksum = sha256( JSON.stringify(stable(normalize(payload))) )
// 注意：本源码为 C# 5 语法（系统自带 csc 可编译），勿使用 C# 7+ 特性。
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace RhSaveTrainer
{
    // ============ 极简 JSON 解析（数字统一解析为 double，与 JS 语义一致） ============
    public static class Json
    {
        public static object Parse(string s)
        {
            int i = 0;
            object v = ParseValue(s, ref i);
            SkipWs(s, ref i);
            if (i != s.Length) throw new Exception("JSON 尾部有多余内容 @ " + i);
            return v;
        }

        static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
        }

        static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) throw new Exception("意外结束");
            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (c == 't') { Expect(s, ref i, "true"); return true; }
            if (c == 'f') { Expect(s, ref i, "false"); return false; }
            if (c == 'n') { Expect(s, ref i, "null"); return null; }
            return ParseNumber(s, ref i);
        }

        static void Expect(string s, ref int i, string word)
        {
            if (i + word.Length > s.Length || s.Substring(i, word.Length) != word)
                throw new Exception("非法 JSON 词 @" + i);
            i += word.Length;
        }

        static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            i++; // {
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (true)
            {
                SkipWs(s, ref i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (s[i] != ':') throw new Exception("缺少冒号 @" + i);
                i++;
                object v = ParseValue(s, ref i);
                d[key] = v;
                SkipWs(s, ref i);
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return d; }
                throw new Exception("非法对象 @" + i);
            }
        }

        static List<object> ParseArray(string s, ref int i)
        {
            List<object> a = new List<object>();
            i++; // [
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return a; }
            while (true)
            {
                a.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return a; }
                throw new Exception("非法数组 @" + i);
            }
        }

        static string ParseString(string s, ref int i)
        {
            i++; // "
            StringBuilder sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i];
                if (c == '"') { i++; return sb.ToString(); }
                if (c == '\\')
                {
                    i++;
                    if (i >= s.Length) throw new Exception("转义不完整");
                    char e = s[i];
                    switch (e)
                    {
                        case '"': sb.Append('"'); i++; break;
                        case '\\': sb.Append('\\'); i++; break;
                        case '/': sb.Append('/'); i++; break;
                        case 'b': sb.Append('\b'); i++; break;
                        case 'f': sb.Append('\f'); i++; break;
                        case 'n': sb.Append('\n'); i++; break;
                        case 'r': sb.Append('\r'); i++; break;
                        case 't': sb.Append('\t'); i++; break;
                        case 'u':
                            if (i + 4 >= s.Length) throw new Exception("\\u 不完整");
                            int cp = int.Parse(s.Substring(i + 1, 4), NumberStyles.HexNumber);
                            i += 5;
                            // 代理对
                            if (cp >= 0xD800 && cp <= 0xDBFF && i + 5 < s.Length && s[i] == '\\' && s[i + 1] == 'u')
                            {
                                int lo = int.Parse(s.Substring(i + 2, 4), NumberStyles.HexNumber);
                                if (lo >= 0xDC00 && lo <= 0xDFFF)
                                {
                                    cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                                    i += 6;
                                }
                            }
                            sb.Append(char.ConvertFromUtf32(cp));
                            break;
                        default: throw new Exception("非法转义 \\" + e);
                    }
                }
                else { sb.Append(c); i++; }
            }
            throw new Exception("字符串未闭合");
        }

        static object ParseNumber(string s, ref int i)
        {
            int start = i;
            if (s[i] == '-') i++;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-'))
                i++;
            string ns = s.Substring(start, i - start);
            return ParseNumberExact(ns);
        }

        // 正确舍入的十进制->double 解析（.NET Framework 的 double.Parse 有时偏 1 ULP，不可用）。
        // 语义与 JS Number / Python float 一致：对 64 位位型二分 + 精确有理数比较，平局取偶。
        public static double ParseNumberExact(string s)
        {
            int idx = 0;
            bool neg = false;
            if (s[0] == '-') { neg = true; idx = 1; }
            BigInteger n = BigInteger.Zero;
            int exp10 = 0;
            bool seenDot = false;
            for (; idx < s.Length; idx++)
            {
                char c = s[idx];
                if (c == '.') { seenDot = true; }
                else if (c == 'e' || c == 'E')
                {
                    idx++;
                    bool eneg = false;
                    if (idx < s.Length && (s[idx] == '+' || s[idx] == '-')) { eneg = s[idx] == '-'; idx++; }
                    int ev = 0;
                    for (; idx < s.Length; idx++) ev = ev * 10 + (s[idx] - '0');
                    if (eneg) ev = -ev;
                    exp10 += ev;
                    break;
                }
                else
                {
                    n = n * 10 + (c - '0');
                    if (seenDot) exp10--;
                }
            }
            if (n.IsZero) return neg ? -0.0 : 0.0;
            // T = n * 10^exp10（精确）
            // 二分：最小的位型 b 使得 value(b) >= T
            ulong lo = 0, hi = 0x7FEFFFFFFFFFFFFFUL; // [0, max finite]
            while (lo < hi)
            {
                ulong mid = lo + (hi - lo) / 2;
                if (ValueGe(mid, n, exp10)) hi = mid;
                else lo = mid + 1;
            }
            if (lo == 0x7FEFFFFFFFFFFFFFUL && !ValueGe(lo, n, exp10))
                return neg ? double.NegativeInfinity : double.PositiveInfinity;
            ulong b2 = lo, b1 = lo > 0 ? lo - 1 : 0;
            int cmp = CompareDist(b1, b2, n, exp10);
            ulong chosen = b2;
            if (cmp < 0) chosen = b1;
            else if (cmp == 0) chosen = MantissaEven(b1) ? b1 : b2;
            double r = BitConverter.Int64BitsToDouble((long)chosen);
            return neg ? -r : r;
        }

        static bool ValueGe(ulong b, BigInteger n, int exp10)
        {
            BigInteger num1, den1, num2, den2;
            GetValue(b, out num1, out den1);
            if (exp10 >= 0) { num2 = n * Pow10(exp10); den2 = BigInteger.One; }
            else { num2 = n; den2 = Pow10(-exp10); }
            return BigInteger.Compare(num1 * den2, num2 * den1) >= 0;
        }

        // 比较 |value(b1)-T| 与 |value(b2)-T|；返回 -1/0/1
        static int CompareDist(ulong b1, ulong b2, BigInteger n, int exp10)
        {
            BigInteger num2, den2;
            if (exp10 >= 0) { num2 = n * Pow10(exp10); den2 = BigInteger.One; }
            else { num2 = n; den2 = Pow10(-exp10); }
            BigInteger a1, d1, a2, d2;
            GetValue(b1, out a1, out d1);
            GetValue(b2, out a2, out d2);
            BigInteger na1 = BigInteger.Abs(a1 * den2 - num2 * d1);
            BigInteger nd1 = d1 * den2;
            BigInteger na2 = BigInteger.Abs(a2 * den2 - num2 * d2);
            BigInteger nd2 = d2 * den2;
            return BigInteger.Compare(na1 * nd2, na2 * nd1);
        }

        static bool MantissaEven(ulong b)
        {
            ulong frac = b & 0xFFFFFFFFFFFFFUL;
            int bexp = (int)((b >> 52) & 0x7FF);
            BigInteger M = bexp == 0 ? frac : (BigInteger.One << 52) + frac;
            return M.IsEven;
        }

        // value(b) = num/den（b 为正数位型，无符号解释）
        static void GetValue(ulong b, out BigInteger num, out BigInteger den)
        {
            int bexp = (int)((b >> 52) & 0x7FF);
            ulong frac = b & 0xFFFFFFFFFFFFFUL;
            BigInteger M;
            int e2;
            if (bexp == 0) { M = frac; e2 = -1074; }
            else { M = (BigInteger.One << 52) + frac; e2 = bexp - 1075; }
            if (e2 >= 0) { num = M << e2; den = BigInteger.One; }
            else { num = M; den = BigInteger.One << (-e2); }
        }

        // ============ 序列化（对齐 Python json.dumps） ============
        public static string Dump(object v, bool pretty)
        {
            StringBuilder sb = new StringBuilder();
            WriteValue(sb, v, pretty, 0);
            return sb.ToString();
        }

        static void Indent(StringBuilder sb, int level)
        {
            for (int k = 0; k < level; k++) sb.Append("  ");
        }

        static void WriteValue(StringBuilder sb, object v, bool pretty, int level)
        {
            if (v == null) { sb.Append("null"); return; }
            if (v is bool) { sb.Append((bool)v ? "true" : "false"); return; }
            if (v is string) { WriteString(sb, (string)v); return; }
            if (v is long) { sb.Append(((long)v).ToString(CultureInfo.InvariantCulture)); return; }
            if (v is int) { sb.Append(((int)v).ToString(CultureInfo.InvariantCulture)); return; }
            if (v is double) { sb.Append(FmtDouble((double)v)); return; }
            if (v is SortedDictionary<string, object>) { WriteObject(sb, (SortedDictionary<string, object>)v, pretty, level); return; }
            if (v is Dictionary<string, object>) { WriteObject(sb, (Dictionary<string, object>)v, pretty, level); return; }
            if (v is List<object>) { WriteArray(sb, (List<object>)v, pretty, level); return; }
            throw new Exception("无法序列化类型: " + v.GetType());
        }

        static void WriteObject(StringBuilder sb, object obj, bool pretty, int level)
        {
            // 统一按 key 排序（stable() 已排序；此处对任何字典都排序以保证确定性）
            List<KeyValuePair<string, object>> items = new List<KeyValuePair<string, object>>();
            if (obj is SortedDictionary<string, object>)
            {
                foreach (KeyValuePair<string, object> kv in (SortedDictionary<string, object>)obj) items.Add(kv);
            }
            else
            {
                foreach (KeyValuePair<string, object> kv in (Dictionary<string, object>)obj) items.Add(kv);
            }
            items.Sort(delegate(KeyValuePair<string, object> a, KeyValuePair<string, object> b)
            { return string.CompareOrdinal(a.Key, b.Key); });

            sb.Append('{');
            if (pretty) { sb.Append('\n'); }
            for (int n = 0; n < items.Count; n++)
            {
                if (pretty) Indent(sb, level + 1);
                WriteString(sb, items[n].Key);
                sb.Append(pretty ? ": " : ":");
                WriteValue(sb, items[n].Value, pretty, level + 1);
                if (n < items.Count - 1) sb.Append(',');
                if (pretty) sb.Append('\n');
            }
            if (pretty) Indent(sb, level);
            sb.Append('}');
        }

        static void WriteArray(StringBuilder sb, List<object> list, bool pretty, int level)
        {
            sb.Append('[');
            if (pretty) sb.Append('\n');
            for (int n = 0; n < list.Count; n++)
            {
                if (pretty) Indent(sb, level + 1);
                WriteValue(sb, list[n], pretty, level + 1);
                if (n < list.Count - 1) sb.Append(',');
                if (pretty) sb.Append('\n');
            }
            if (pretty) Indent(sb, level);
            sb.Append(']');
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c); // 非 ASCII 原样输出（ensure_ascii=False）
                        break;
                }
            }
            sb.Append('"');
        }

        // Python/JS(V8) 兼容的浮点最短往返表示（正确舍入，平局取偶，Python repr 风格）
        public static string FmtDouble(double d)
        {
            return ShortestRepr(d);
        }

        static BigInteger Pow10(int k)
        {
            BigInteger r = BigInteger.One;
            for (int i = 0; i < k; i++) r *= 10;
            return r;
        }

        // value = num * 2^e2 / 10^kk -> n2/d2 (d2 > 0)
        static void Scale(BigInteger num, int e2, int kk, out BigInteger n2, out BigInteger d2)
        {
            n2 = num;
            d2 = BigInteger.One;
            if (e2 >= 0) n2 = n2 << e2; else d2 = d2 << (-e2);
            if (kk >= 0) d2 = d2 * Pow10(kk); else n2 = n2 * Pow10(-kk);
        }

        // ceil/floor(value)，incl 控制是否允许恰好等于
        static BigInteger Bound(BigInteger num, int e2, int kk, bool incl, bool isCeil)
        {
            BigInteger n2, d2;
            Scale(num, e2, kk, out n2, out d2);
            BigInteger r;
            BigInteger q = BigInteger.DivRem(n2, d2, out r);
            if (isCeil)
            {
                if (r > 0) return q + 1;
                return incl ? q : q + 1;
            }
            else
            {
                if (r > 0) return q;
                return incl ? q : q - 1;
            }
        }

        // |t - dNum*2^dE/10^kk| 的通分分子（同 kk 下可比较）
        static BigInteger DistNum(BigInteger t, int kk, BigInteger dNum, int dE)
        {
            BigInteger n2, d2;
            Scale(dNum, dE, kk, out n2, out d2);
            return BigInteger.Abs(t * d2 - n2);
        }

        static string FormatDigits(BigInteger t, int kk, bool neg)
        {
            string raw = t.ToString();
            string digits = raw.TrimEnd('0');
            kk += raw.Length - digits.Length;
            int exp10 = kk + digits.Length - 1; // 首位小数指数
            string body;
            if (exp10 >= -4 && exp10 < 16)
            {
                if (exp10 >= 0)
                {
                    if (exp10 + 1 >= digits.Length)
                        body = digits + new string('0', exp10 + 1 - digits.Length) + ".0";
                    else
                        body = digits.Substring(0, exp10 + 1) + "." + digits.Substring(exp10 + 1);
                }
                else
                {
                    body = "0." + new string('0', -exp10 - 1) + digits;
                }
            }
            else
            {
                string mant = digits.Length > 1 ? digits[0] + "." + digits.Substring(1) : digits;
                body = mant + "e" + (exp10 < 0 ? "-" : "+") + Math.Abs(exp10).ToString("00", CultureInfo.InvariantCulture);
            }
            return neg ? "-" + body : body;
        }

        // 正确舍入的最短表示：与 CPython repr / V8 Number::toString 输出一致
        static string ShortestRepr(double d)
        {
            if (d == 0.0) return "0.0";
            if (double.IsNaN(d) || double.IsInfinity(d)) throw new Exception("存档含有非有限数字");
            bool neg = d < 0.0;
            double ad = Math.Abs(d);
            long bits = BitConverter.DoubleToInt64Bits(ad);
            int biasedExp = (int)(((ulong)bits >> 52) & 0x7FF);
            ulong fraction = (ulong)bits & 0xFFFFFFFFFFFFFUL;

            BigInteger M;
            int E;
            if (biasedExp == 0) { M = fraction; E = -1074; }
            else { M = (BigInteger.One << 52) + fraction; E = biasedExp - 1023 - 52; }

            // 舍入区间 [lo, hi]：落在其中的十进制数都会 round 到 d
            // lo = (2M-1)*2^(E-1), hi = (2M+1)*2^(E-1)；M 为偶数时端点含等号（round-half-even）
            BigInteger loNum = 2 * M - 1;
            BigInteger hiNum = 2 * M + 1;
            int e2 = E - 1;
            bool inclLo = M.IsEven, inclHi = M.IsEven;

            int estK = (int)Math.Floor(Math.Log10(ad));
            for (int len = 1; len <= 17; len++)
            {
                int kBase = estK - len + 1;
                for (int kk = kBase - 2; kk <= kBase + 2; kk++)
                {
                    BigInteger tMin = Bound(loNum, e2, kk, inclLo, true);
                    BigInteger tMax = Bound(hiNum, e2, kk, inclHi, false);
                    if (tMin > tMax) continue;

                    // 选最接近 d/10^kk 的 T；等距取末位偶数
                    BigInteger best = tMin;
                    BigInteger bestDist = DistNum(tMin, kk, M, E);
                    for (BigInteger t = tMin + 1; t <= tMax; t += 1)
                    {
                        BigInteger dist = DistNum(t, kk, M, E);
                        int cmp = BigInteger.Compare(dist, bestDist);
                        if (cmp < 0 || (cmp == 0 && IsEvenLastDigit(t) && !IsEvenLastDigit(best)))
                        {
                            best = t;
                            bestDist = dist;
                        }
                    }
                    // 关键：候选必须恰好 len 位有效数字（去掉末尾0后），否则不是本 len 的表示
                    // 例如 5e-324 的 1 位表示在 kk=-324 才出现，kk=-326 的 494(3位) 必须跳过
                    string rawT = best.ToString();
                    if (rawT.TrimEnd('0').Length != len) continue;
                    return FormatDigits(best, kk, neg);
                }
            }
            throw new Exception("无法表示 " + d);
        }

        static bool IsEvenLastDigit(BigInteger t)
        {
            return (t % 10).IsEven;
        }

        // ============ 深层工具 ============
        public static object Clone(object v)
        {
            if (v == null || v is string || v is bool || v is double || v is long || v is int) return v;
            if (v is Dictionary<string, object>)
            {
                Dictionary<string, object> nd = new Dictionary<string, object>();
                foreach (KeyValuePair<string, object> kv in (Dictionary<string, object>)v) nd[kv.Key] = Clone(kv.Value);
                return nd;
            }
            if (v is SortedDictionary<string, object>)
            {
                SortedDictionary<string, object> nd = new SortedDictionary<string, object>();
                foreach (KeyValuePair<string, object> kv in (SortedDictionary<string, object>)v) nd[kv.Key] = Clone(kv.Value);
                return nd;
            }
            if (v is List<object>)
            {
                List<object> nl = new List<object>();
                foreach (object x in (List<object>)v) nl.Add(Clone(x));
                return nl;
            }
            return v;
        }

        // Python stable(): 字典 key 排序 + 整数值浮点 -> 整数
        public static object Stable(object v)
        {
            if (v == null || v is string || v is bool) return v;
            if (v is double)
            {
                double d = (double)v;
                if (!double.IsNaN(d) && !double.IsInfinity(d) && d == Math.Floor(d) && Math.Abs(d) < 9.2e18)
                    return (long)d;
                return d;
            }
            if (v is long || v is int) return v;
            if (v is Dictionary<string, object>)
            {
                SortedDictionary<string, object> nd = new SortedDictionary<string, object>();
                foreach (KeyValuePair<string, object> kv in (Dictionary<string, object>)v) nd[kv.Key] = Stable(kv.Value);
                return nd;
            }
            if (v is SortedDictionary<string, object>)
            {
                SortedDictionary<string, object> nd = new SortedDictionary<string, object>();
                foreach (KeyValuePair<string, object> kv in (SortedDictionary<string, object>)v) nd[kv.Key] = Stable(kv.Value);
                return nd;
            }
            if (v is List<object>)
            {
                List<object> nl = new List<object>();
                foreach (object x in (List<object>)v) nl.Add(Stable(x));
                return nl;
            }
            return v;
        }
    }

    // ============ 存档编解码（对齐 Python rh_trainer） ============
    public static class SaveCodec
    {
        public static Dictionary<string, object> NormalizeStringRecord(object value)
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            Dictionary<string, object> src = value as Dictionary<string, object>;
            if (src != null)
                foreach (KeyValuePair<string, object> kv in src)
                    if (!string.IsNullOrEmpty(kv.Key) && kv.Value is Dictionary<string, object>)
                        result[kv.Key] = Json.Clone(kv.Value);
            return result;
        }

        public static Dictionary<string, object> NormalizeLedger(object value)
        {
            Dictionary<string, object> src = value as Dictionary<string, object>;
            if (src == null) src = new Dictionary<string, object>();
            SortedSet<string> ach = new SortedSet<string>();
            object achObj;
            if (src.TryGetValue("achievementIds", out achObj))
            {
                List<object> achList = achObj as List<object>;
                if (achList != null)
                    foreach (object x in achList) if (x is string && ((string)x).Length > 0) ach.Add((string)x);
            }
            SortedSet<string> ops = new SortedSet<string>();
            object opsObj;
            if (src.TryGetValue("appliedOperationIds", out opsObj))
            {
                List<object> opsList = opsObj as List<object>;
                if (opsList != null)
                    foreach (object x in opsList) if (x is string && ((string)x).Length > 0) ops.Add((string)x);
            }
            object cw, rc, spg;
            Dictionary<string, object> ledger = new Dictionary<string, object>();
            ledger["claimWindows"] = NormalizeStringRecord(src.TryGetValue("claimWindows", out cw) ? cw : null);
            ledger["redeemedCodes"] = NormalizeStringRecord(src.TryGetValue("redeemedCodes", out rc) ? rc : null);
            ledger["achievementIds"] = new List<object>(ach);
            ledger["steamPurchaseGrants"] = NormalizeStringRecord(src.TryGetValue("steamPurchaseGrants", out spg) ? spg : null);
            ledger["appliedOperationIds"] = new List<object>(ops);
            return ledger;
        }

        public static object NormalizeActiveRun(object value)
        {
            return value == null ? null : Json.Clone(value);
        }

        public static Dictionary<string, object> NormalizeProgress(object value)
        {
            Dictionary<string, object> src = value as Dictionary<string, object>;
            if (src == null) src = new Dictionary<string, object>();
            object pr, pend, ar;
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["profile"] = Json.Clone(src.TryGetValue("profile", out pr) ? pr : new Dictionary<string, object>());
            result["pendingRun"] = src.TryGetValue("pendingRun", out pend) && pend != null ? Json.Clone(pend) : null;
            result["activeRun"] = NormalizeActiveRun(src.TryGetValue("activeRun", out ar) ? ar : null);
            return result;
        }

        public static Dictionary<string, object> NormalizePayload(object value)
        {
            Dictionary<string, object> src = value as Dictionary<string, object>;
            if (src == null) src = new Dictionary<string, object>();
            object prog, led;
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["progress"] = NormalizeProgress(src.TryGetValue("progress", out prog) ? prog : null);
            result["accountLedger"] = NormalizeLedger(src.TryGetValue("accountLedger", out led) ? led : null);
            return result;
        }

        public static string SerializePayload(Dictionary<string, object> payload)
        {
            return Json.Dump(Json.Stable(NormalizePayload(payload)), false);
        }

        public static string CreateChecksum(Dictionary<string, object> payload)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(SerializePayload(payload));
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(bytes);
                StringBuilder sb = new StringBuilder();
                foreach (byte b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        public static Dictionary<string, object> RebuildEnvelope(Dictionary<string, object> env, Dictionary<string, object> payload)
        {
            Dictionary<string, object> e = (Dictionary<string, object>)Json.Clone(env);
            e["payload"] = NormalizePayload(payload);
            object rv;
            long rev = 0;
            if (e.TryGetValue("revision", out rv) && rv is double) rev = (long)(double)rv;
            e["revision"] = rev + 1;
            e["savedAt"] = (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            e["checksumAlgorithm"] = "sha256";
            e["checksum"] = CreateChecksum(payload);
            return e;
        }

        // 读取磁盘上存档文件当前的 revision（用于写入前比对，防止覆盖游戏更新后的存档）。
        // 文件不存在/损坏/无 revision 字段时返回 -1（此时不做拦截）。
        public static long ReadRevision(string path)
        {
            if (!File.Exists(path)) return -1;
            try
            {
                string raw = File.ReadAllText(path, new UTF8Encoding(false));
                object top = Json.Parse(raw);
                Dictionary<string, object> env = top as Dictionary<string, object>;
                if (env == null) return -1;
                object rv;
                return env.TryGetValue("revision", out rv) && rv is double ? (long)(double)rv : -1;
            }
            catch { return -1; }
        }
    }

    // ============ GUI ============
    public class InvItem
    {
        public int Index;
        public string DefId;
        public string InstanceId;
        public bool IsStash;
        public InvItem(int idx, string defId, string instanceId, bool stash) { Index = idx; DefId = defId; InstanceId = instanceId; IsStash = stash; }
    }

    public partial class MainForm : Form
    {
        static readonly string[] Slots = { "current", "manual-1", "manual-2", "manual-3" };

        TextBox _dirBox;
        ComboBox _slotBox;
        Label _status;
        TabControl _tabs;
        ListBox _invList;
        NumericUpDown _invQty;
        NumericUpDown _invQtyAll;
        ComboBox _invScope;
        Button _saveBtn;
        bool _dirty;

        Dictionary<string, TextBox> _profileEntries = new Dictionary<string, TextBox>();
        Dictionary<string, TextBox> _runEntries = new Dictionary<string, TextBox>();
        Dictionary<string, TextBox> _p2Entries = new Dictionary<string, TextBox>();

        Dictionary<string, object> _env;
        Dictionary<string, object> _payload;
        List<InvItem> _invItems = new List<InvItem>();

        string SavesDir { get { return _dirBox.Text.Trim(); } }
        string SlotFile { get { return Path.Combine(SavesDir, "progress-" + _slotBox.SelectedItem + ".json"); } }

        public MainForm()
        {
            Text = "末世：我有一辆房车 - 存档修改器 v3.5（免环境版）";
            Font = new Font("Microsoft YaHei UI", 9f);
            ClientSize = new Size(880, 640);
            MinimumSize = new Size(800, 580);
            StartPosition = FormStartPosition.CenterScreen;

            // 顶部：存档目录
            TableLayoutPanel top = new TableLayoutPanel();
            top.Dock = DockStyle.Top;
            top.Height = 60;
            top.ColumnCount = 4;
            top.Padding = new Padding(8, 6, 8, 2);
            top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            Label l1 = new Label();
            l1.Text = "存档目录:";
            l1.AutoSize = true;
            l1.Anchor = AnchorStyles.Left;
            top.Controls.Add(l1, 0, 0);

            _dirBox = new TextBox();
            _dirBox.Dock = DockStyle.Fill;
            _dirBox.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            _dirBox.Text = DefaultSavesDir();
            top.Controls.Add(_dirBox, 1, 0);

            Button browse = new Button();
            browse.Text = "浏览…";
            browse.Width = 70;
            browse.Anchor = AnchorStyles.Left;
            browse.Click += delegate(object s, EventArgs e)
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.SelectedPath = SavesDir;
                    if (d.ShowDialog(this) == DialogResult.OK) { _dirBox.Text = d.SelectedPath; DoLoad(); }
                }
            };
            top.Controls.Add(browse, 2, 0);

            Button openDir = new Button();
            openDir.Text = "打开目录";
            openDir.Width = 80;
            openDir.Anchor = AnchorStyles.Left;
            openDir.Click += delegate(object s, EventArgs e)
            {
                if (Directory.Exists(SavesDir)) System.Diagnostics.Process.Start("explorer.exe", "\"" + SavesDir + "\"");
            };
            top.Controls.Add(openDir, 3, 0);

            // 第二行：槽位 + 按钮
            TableLayoutPanel bar2 = new TableLayoutPanel();
            bar2.Dock = DockStyle.Top;
            bar2.Height = 36;
            bar2.ColumnCount = 6;
            bar2.Padding = new Padding(8, 0, 8, 4);
            bar2.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar2.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar2.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar2.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar2.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar2.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            Label l2 = new Label();
            l2.Text = "存档槽位:";
            l2.AutoSize = true;
            l2.Anchor = AnchorStyles.Left;
            bar2.Controls.Add(l2, 0, 0);

            _slotBox = new ComboBox();
            _slotBox.DropDownStyle = ComboBoxStyle.DropDownList;
            _slotBox.Width = 110;
            foreach (string s in Slots) _slotBox.Items.Add(s);
            _slotBox.SelectedIndex = 0;
            _slotBox.SelectedIndexChanged += delegate(object s, EventArgs e) { DoLoad(); };
            bar2.Controls.Add(_slotBox, 1, 0);

            bar2.Controls.Add(MakeButton("读取存档", DoLoad), 2, 0);
            bar2.Controls.Add(MakeButton("备份存档", DoBackup), 3, 0);
            _saveBtn = MakeButton("写入修改", DoSave);
            bar2.Controls.Add(_saveBtn, 4, 0);

            // 状态文字：放回第二行右侧（消息已简化，单行显示，不换行重叠）
            _status = new Label();
            _status.Text = "就绪。请先关闭游戏再修改存档。";
            _status.AutoSize = true;
            _status.Anchor = AnchorStyles.Right;
            _status.ForeColor = Color.FromArgb(102, 102, 102);
            bar2.Controls.Add(_status, 5, 0);

            Label tip = new Label();
            tip.Dock = DockStyle.Bottom;
            tip.Height = 26;
            tip.Text = "标签颜色：●绿=局内可改（运行中写入自动生效）　●红=局外可改（需关闭游戏后修改）。写入自动备份、自动重算校验和。";
            tip.ForeColor = Color.FromArgb(170, 0, 0);
            tip.TextAlign = ContentAlignment.MiddleLeft;
            tip.Padding = new Padding(10, 0, 0, 0);

            _tabs = new TabControl();
            _tabs.Dock = DockStyle.Fill;
            TabPage tp;
            tp = BuildProfileTab(); tp.Tag = "live"; _tabs.TabPages.Add(tp);
            tp = BuildRunTab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);
            tp = BuildP2Tab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);
            tp = BuildInvTab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);
            tp = BuildCharTab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);
            tp = BuildEquipTab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);
            tp = BuildCardTab(); tp.Tag = "live"; _tabs.TabPages.Add(tp);
            tp = BuildRouteTab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);
            tp = BuildMedTab(); tp.Tag = "out"; _tabs.TabPages.Add(tp);

            // 添加顺序决定停靠（与最初可用布局一致）
            Controls.Add(_tabs);
            Controls.Add(bar2);
            Controls.Add(top);
            Controls.Add(tip);
            ApplyTheme();
        }

        Button MakeButton(string text, Action onClick)
        {
            Button b = new Button();
            b.Text = text;
            b.Width = 90;
            b.Anchor = AnchorStyles.Left;
            b.Click += delegate(object s, EventArgs e) { onClick(); };
            return b;
        }

        static string DefaultSavesDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Rebirth Hoarder", "steam-cloud", "saves");
        }

        TabPage BuildProfileTab()
        {
            TabPage page = new TabPage("角色 / 全局");
            GroupBox f = new GroupBox();
            f.Text = "角色全局属性　⚡ 局内可改（运行中自动生效）";
            f.Dock = DockStyle.Fill;
            TableLayoutPanel tbl = new TableLayoutPanel();
            tbl.Dock = DockStyle.Top;
            tbl.AutoSize = true;
            tbl.ColumnCount = 2;
            tbl.Padding = new Padding(10);
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddField(tbl, _profileEntries, "源晶 sourceCrystals");
            AddField(tbl, _profileEntries, "晶核 crystalCores");
            AddField(tbl, _profileEntries, "觉醒天赋点 awakeningTalentPoints");
            AddField(tbl, _profileEntries, "声望总点数 reputation.totalPoints");
            AddField(tbl, _profileEntries, "挂机待领源晶 idleSystem.pendingCrystals");
            AddField(tbl, _profileEntries, "重生次数 reincarnationCount");
            AddField(tbl, _profileEntries, "继承-最大生命 inheritedStats.maxHp");
            AddField(tbl, _profileEntries, "继承-攻击 inheritedStats.attack");
            AddField(tbl, _profileEntries, "继承-防御 inheritedStats.defense");
            AddField(tbl, _profileEntries, "继承-最大饥饿 inheritedStats.maxHunger");
            AddField(tbl, _profileEntries, "继承-最大口渴 inheritedStats.maxThirst");
            f.Controls.Add(tbl);
            page.Controls.Add(f);
            return page;
        }

        TabPage BuildRunTab()
        {
            TabPage page = new TabPage("当前局");
            GroupBox f = new GroupBox();
            f.Text = "当前局数值　🔒 局外可改（需关闭游戏）";
            f.Dock = DockStyle.Fill;
            TableLayoutPanel tbl = new TableLayoutPanel();
            tbl.Dock = DockStyle.Top;
            tbl.AutoSize = true;
            tbl.ColumnCount = 2;
            tbl.Padding = new Padding(10);
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddField(tbl, _runEntries, "现金 cash");
            AddField(tbl, _runEntries, "心情 mood");
            AddField(tbl, _runEntries, "剩余天数 daysRemaining");
            AddField(tbl, _runEntries, "剩余小时 hoursRemaining");
            AddField(tbl, _runEntries, "信用分 creditScore");
            AddField(tbl, _runEntries, "紧急复活次数 emergencyReviveCharges");
            AddField(tbl, _runEntries, "房车等级 vehicleLevel");
            AddField(tbl, _runEntries, "背包等级 backpackLevel");
            AddField(tbl, _runEntries, "幸运加成 luckBonus");
            f.Controls.Add(tbl);
            page.Controls.Add(f);
            return page;
        }

        TabPage BuildP2Tab()
        {
            TabPage page = new TabPage("P2 战斗");
            GroupBox f = new GroupBox();
            f.Text = "P2 战斗属性　🔒 局外可改（需关闭游戏）";
            f.Dock = DockStyle.Fill;
            Label tip = new Label();
            tip.Text = "提示：生命/攻击/防御是游戏按属性点、等级、装备实时重算的派生值，直接改会被覆盖。请改「角色属性」页的属性点或等级、装备来提升。";
            tip.Dock = DockStyle.Top;
            tip.AutoSize = true;
            tip.MaximumSize = new Size(860, 0);
            tip.Padding = new Padding(10, 4, 10, 2);
            tip.ForeColor = Color.FromArgb(150, 100, 40);
            tip.BackColor = Color.White;
            TableLayoutPanel tbl = new TableLayoutPanel();
            tbl.Dock = DockStyle.Top;
            tbl.AutoSize = true;
            tbl.ColumnCount = 2;
            tbl.Padding = new Padding(10);
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddField(tbl, _p2Entries, "生命 hp");
            AddField(tbl, _p2Entries, "最大生命 maxHp");
            AddField(tbl, _p2Entries, "攻击 attack");
            AddField(tbl, _p2Entries, "防御 defense");
            AddField(tbl, _p2Entries, "燃料 fuel");
            AddField(tbl, _p2Entries, "最大燃料 maxFuel");
            AddField(tbl, _p2Entries, "弹药 ammo");
            AddField(tbl, _p2Entries, "最大弹药 maxAmmo");
            f.Controls.Add(tbl);
            f.Controls.Add(tip);   // tip 后加，Dock.Top 时位于 tbl 上方
            page.Controls.Add(f);
            return page;
        }

        TabPage BuildInvTab()
        {
            TabPage page = new TabPage("物品");
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.Padding = new Padding(8);
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 200));

            _invList = new ListBox();
            _invList.Dock = DockStyle.Fill;
            _invList.Font = new Font("Microsoft YaHei UI", 9.5f);
            _invList.SelectedIndexChanged += delegate(object s, EventArgs e) { OnInvSelect(); };
            layout.Controls.Add(_invList, 0, 0);

            Panel right = new Panel();
            right.Dock = DockStyle.Fill;
            int y = 8;
            Label scl = new Label();
            scl.Text = "显示：";
            scl.Location = new Point(10, y);
            scl.AutoSize = true;
            right.Controls.Add(scl);
            y += 24;
            _invScope = new ComboBox();
            _invScope.Location = new Point(10, y);
            _invScope.Width = 168;
            _invScope.DropDownStyle = ComboBoxStyle.DropDownList;
            _invScope.Items.Add("背包 inventory");
            _invScope.Items.Add("仓库 stash");
            _invScope.SelectedIndexChanged += delegate(object s, EventArgs e) { RepopulateInv(); };
            _invScope.SelectedIndex = 0;
            right.Controls.Add(_invScope);
            y += 34;
            Label ql = new Label();
            ql.Text = "数量 quantity:";
            ql.Location = new Point(10, y);
            ql.AutoSize = true;
            right.Controls.Add(ql);
            y += 26;
            _invQty = new NumericUpDown();
            _invQty.Location = new Point(10, y);
            _invQty.Width = 120;
            _invQty.Maximum = 999999999;
            _invQty.ValueChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            right.Controls.Add(_invQty);
            y += 34;
            Button apply = new Button();
            apply.Text = "应用到选中物品";
            apply.Location = new Point(10, y);
            apply.Width = 150;
            apply.Click += delegate(object s, EventArgs e) { ApplyInvQty(); };
            right.Controls.Add(apply);
            y += 36;
            Button all99 = new Button();
            all99.Text = "全部设为 99";
            all99.Location = new Point(10, y);
            all99.Width = 150;
            all99.Click += delegate(object s, EventArgs e) { FillAllInv(99); };
            right.Controls.Add(all99);
            y += 36;
            Button all999 = new Button();
            all999.Text = "全部设为 999";
            all999.Location = new Point(10, y);
            all999.Width = 150;
            all999.Click += delegate(object s, EventArgs e) { FillAllInv(999); };
            right.Controls.Add(all999);
            y += 36;
            Label allLbl = new Label();
            allLbl.Text = "全部设为：";
            allLbl.Location = new Point(10, y);
            allLbl.AutoSize = true;
            allLbl.ForeColor = Color.FromArgb(120, 120, 120);
            right.Controls.Add(allLbl);
            y += 22;
            _invQtyAll = new NumericUpDown();
            _invQtyAll.Location = new Point(10, y);
            _invQtyAll.Width = 130;
            _invQtyAll.Minimum = 0;
            _invQtyAll.Maximum = 999999999;
            _invQtyAll.Value = 10;
            right.Controls.Add(_invQtyAll);
            y += 34;
            Button allX = new Button();
            allX.Text = "✅ 应用到全部物品";
            allX.Location = new Point(10, y);
            allX.Width = 150;
            allX.Click += delegate(object s, EventArgs e) { FillAllInv((int)_invQtyAll.Value); };
            right.Controls.Add(allX);
            y += 46;
            y += 60;
            Label hint = new Label();
            hint.Text = "提示：修改物品数量后需点\n“应用到选中物品”或“全部设\n为”再点“写入修改”。";
            hint.Location = new Point(10, y);
            hint.AutoSize = true;
            hint.ForeColor = Color.FromArgb(136, 136, 136);
            right.Controls.Add(hint);
            layout.Controls.Add(right, 1, 0);
            page.Controls.Add(layout);
            page.Controls.Add(MakeNote("🔒 局外可改：需关闭游戏修改后生效（游戏自动保存会覆盖运行中的修改）", false));
            return page;
        }

        void AddField(TableLayoutPanel tbl, Dictionary<string, TextBox> store, string label)
        {
            int sp = label.IndexOf(' ');
            string key = sp > 0 ? label.Substring(sp + 1) : label;
            string display = sp > 0 ? label.Substring(0, sp) : label;
            TextBox tb = new TextBox();
            tb.Width = 200;
            tb.Margin = new Padding(6, 2, 6, 2);
            store[key] = tb;
            tbl.RowCount++;
            Label l = new Label();
            l.Text = display;   // 只显示中文，隐藏英文 key
            l.AutoSize = true;
            l.Margin = new Padding(6, 4, 6, 2);
            tbl.Controls.Add(l, 0, tbl.RowCount - 1);
            tbl.Controls.Add(tb, 1, tbl.RowCount - 1);
        }

        void SetStatus(string msg)
        {
            _status.Text = msg;
            _status.ForeColor = Color.FromArgb(102, 102, 102);
        }

        static bool _silent;
        void Msg(string text, string title, MessageBoxIcon icon)
        {
            if (_silent) { LogWrite(title + " | " + text); return; }
            MessageBox.Show(this, text, title, MessageBoxButtons.OK, icon);
        }

        // 写自动重载标记（游戏 mod 通过 mod-storage 检测；该文件不受游戏自动保存覆盖）
        static void WriteApplyMarker()
        {
            try
            {
                string modDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Rebirth Hoarder", "mod-storage");
                Directory.CreateDirectory(modDir);
                string key = "rebirth_mod_apply";
                string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(key))
                    .TrimEnd('=').Replace('+', '-').Replace('/', '_');
                File.WriteAllText(Path.Combine(modDir, b64 + ".json"),
                    DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
                LogWrite("已写入自动重载标记");
            }
            catch (Exception ex)
            {
                LogWrite("标记写入失败: " + ex.Message);
            }
        }

        static bool GameRunning()
        {
            try { return System.Diagnostics.Process.GetProcessesByName("Rebirth Hoarder").Length > 0; }
            catch { return false; }
        }

        void DoLoad()
        {
            string path = SlotFile;
            if (!File.Exists(path))
            {
                SetStatus("未找到存档: " + path);
                Msg("存档文件不存在:\n" + path, "未找到", MessageBoxIcon.Warning);
                return;
            }
            try
            {
                _env = (Dictionary<string, object>)Json.Parse(File.ReadAllText(path, Encoding.UTF8));
                object pv;
                Dictionary<string, object> payload = null;
                if (_env.TryGetValue("payload", out pv)) payload = pv as Dictionary<string, object>;
                if (payload == null) throw new Exception("存档缺少 payload");
                string calc = SaveCodec.CreateChecksum(payload);
                object cv;
                if (_env.TryGetValue("checksum", out cv) && cv is string && (string)cv != calc)
                    SetStatus("警告：现有 checksum 不匹配（存档可能已被修改过）");
                _payload = (Dictionary<string, object>)Json.Clone(payload);
                Populate();
                object rv;
                string rev = _env.TryGetValue("revision", out rv) ? Convert.ToString(rv, CultureInfo.InvariantCulture) : "?";
                MarkClean();
                LogWrite("读取存档 slot=" + _slotBox.SelectedItem + " revision=" + rev);
                SetStatus("已读取（" + _slotBox.SelectedItem + "） revision=" + rev);
                // 防护：游戏运行/保存中可能读到被临时替换的异常档（revision 为 0/1 空档）。
                // 注意：正常档即使新轮回/新档 revision 也可能只有几十，阈值必须低，只拦 revision<2。
                object revObj;
                double revNum = _env.TryGetValue("revision", out revObj) && revObj is double ? (double)revObj : 0;
                if (revNum < 2)
                {
                    SetStatus("警告：存档 revision=" + rev + " 异常！可能游戏正在运行或读取到错误文件，修改将被阻止。");
                    LogWrite("警告：读取到异常 revision=" + rev);
                }
            }
            catch (Exception ex)
            {
                SetStatus("读取失败: " + ex.Message);
                Msg("读取失败:\n" + ex.Message, "错误", MessageBoxIcon.Error);
            }
        }

        void Populate()
        {
            _loading = true;
            Dictionary<string, object> p = _payload;
            Dictionary<string, object> profile = null;
            Dictionary<string, object> activeRun = null;
            Dictionary<string, object> game = null;
            Dictionary<string, object> p2 = null;
            object pr, ar, gs, p2o;
            if (p != null && p.TryGetValue("progress", out pr) && pr is Dictionary<string, object>)
            {
                Dictionary<string, object> pd = (Dictionary<string, object>)pr;
                object pf;
                if (pd.TryGetValue("profile", out pf)) profile = pf as Dictionary<string, object>;
                if (pd.TryGetValue("activeRun", out ar)) activeRun = ar as Dictionary<string, object>;
            }
            if (activeRun != null && activeRun.TryGetValue("gameState", out gs)) game = gs as Dictionary<string, object>;
            if (game != null && game.TryGetValue("p2", out p2o)) p2 = p2o as Dictionary<string, object>;

            if (profile != null)
            {
                object v;
                Put(_profileEntries, "sourceCrystals", profile.TryGetValue("sourceCrystals", out v) ? v : null);
                Put(_profileEntries, "crystalCores", p2 != null && p2.TryGetValue("crystalCores", out v) ? v : null);
                Put(_profileEntries, "awakeningTalentPoints", profile.TryGetValue("awakeningTalentPoints", out v) ? v : null);
                Dictionary<string, object> rep = null;
                object ro;
                if (profile.TryGetValue("reputation", out ro)) rep = ro as Dictionary<string, object>;
                Put(_profileEntries, "reputation.totalPoints", rep != null && rep.TryGetValue("totalPoints", out v) ? v : null);
                Dictionary<string, object> idle = null;
                object io;
                if (profile.TryGetValue("idleSystem", out io)) idle = io as Dictionary<string, object>;
                Put(_profileEntries, "idleSystem.pendingCrystals", idle != null && idle.TryGetValue("pendingCrystals", out v) ? v : null);
                Put(_profileEntries, "reincarnationCount", profile.TryGetValue("reincarnationCount", out v) ? v : null);
                Dictionary<string, object> inh = null;
                object iho;
                if (profile.TryGetValue("inheritedStats", out iho)) inh = iho as Dictionary<string, object>;
                string[] inhKeys = { "maxHp", "attack", "defense", "maxHunger", "maxThirst" };
                foreach (string k in inhKeys)
                    Put(_profileEntries, "inheritedStats." + k, inh != null && inh.TryGetValue(k, out v) ? v : null);
            }

            if (game != null)
            {
                string[] runKeys = { "cash", "mood", "daysRemaining", "hoursRemaining", "creditScore",
                    "emergencyReviveCharges", "vehicleLevel", "backpackLevel", "luckBonus" };
                foreach (string k in runKeys)
                {
                    object v;
                    Put(_runEntries, k, game.TryGetValue(k, out v) ? v : null);
                }
            }

            if (p2 != null)
            {
                string[] p2Keys = { "hp", "maxHp", "attack", "defense", "fuel", "maxFuel", "ammo", "maxAmmo" };
                foreach (string k in p2Keys)
                {
                    object v;
                    Put(_p2Entries, k, p2.TryGetValue(k, out v) ? v : null);
                }
            }

            _invItems.Clear();
            _invList.Items.Clear();
            if (game != null)
            {
                object invObj;
                if (game.TryGetValue("inventory", out invObj))
                {
                    List<object> inv = invObj as List<object>;
                    if (inv != null)
                    {
                        for (int i = 0; i < inv.Count; i++)
                        {
                            Dictionary<string, object> item = inv[i] as Dictionary<string, object>;
                            if (item == null) continue;
                            object dv, iv, qv;
                            string defId = item.TryGetValue("defId", out dv) ? Convert.ToString(dv) : "?";
                            string iid = item.TryGetValue("instanceId", out iv) ? Convert.ToString(iv) : "";
                            string qty = item.TryGetValue("quantity", out qv) ? NumDisplay(qv) : "0";
                            _invItems.Add(new InvItem(i, defId, iid, false));
                            _invList.Items.Add(ItemDisplayName(defId) + "  x" + qty);
                        }
                    }
                }
            }
            if (_invItems.Count == 0) _invList.Items.Add("（无物品）");
            _invQty.Value = 0;
            PopulateNewTabs();
            _loading = false;
        }

        static string NumDisplay(object v)
        {
            if (v is double)
            {
                double d = (double)v;
                if (d == Math.Floor(d) && Math.Abs(d) < 9.2e18) return ((long)d).ToString(CultureInfo.InvariantCulture);
                return d.ToString("G", CultureInfo.InvariantCulture);
            }
            return Convert.ToString(v, CultureInfo.InvariantCulture);
        }

        static void Put(Dictionary<string, TextBox> store, string key, object val)
        {
            TextBox tb;
            if (store.TryGetValue(key, out tb))
                tb.Text = val == null ? "" : NumDisplay(val);
        }

        void OnInvSelect()
        {
            int sel = _invList.SelectedIndex;
            if (sel < 0 || sel >= _invItems.Count || _payload == null) return;
            List<object> inv = GetItemList(_invItems[sel].IsStash);
            int ri = _invItems[sel].Index;
            if (inv == null || ri < 0 || ri >= inv.Count) return;
            Dictionary<string, object> item = inv[ri] as Dictionary<string, object>;
            if (item == null) return;
            object qv;
            if (item.TryGetValue("quantity", out qv) && qv is double)
                _invQty.Value = (decimal)(double)qv;
            else
                _invQty.Value = 0;
        }

        Dictionary<string, object> GetGameState()
        {
            if (_payload == null) return null;
            object pr, ar, gs;
            if (!(_payload.TryGetValue("progress", out pr) && pr is Dictionary<string, object>)) return null;
            if (!(((Dictionary<string, object>)pr).TryGetValue("activeRun", out ar) && ar is Dictionary<string, object>)) return null;
            if (!(((Dictionary<string, object>)ar).TryGetValue("gameState", out gs) && gs is Dictionary<string, object>)) return null;
            return (Dictionary<string, object>)gs;
        }

        void ApplyInvQty()
        {
            int sel = _invList.SelectedIndex;
            if (sel < 0 || sel >= _invItems.Count || _payload == null) return;
            List<object> inv = GetItemList(_invItems[sel].IsStash);
            int ri = _invItems[sel].Index;
            if (inv == null || ri < 0 || ri >= inv.Count) return;
            Dictionary<string, object> item = inv[ri] as Dictionary<string, object>;
            if (item == null) return;
            item["quantity"] = (double)_invQty.Value;
            RefreshInvLine(sel);
            SetStatus("已修改 " + _invItems[sel].DefId + " 数量 = " + _invQty.Value + "（记得点“写入修改”）");
            MarkDirty();
        }

        void FillAllInv(int qty)
        {
            Dictionary<string, object> gs = GetGameState();
            if (gs == null) return;
            int cnt = 0, skipped = 0;
            foreach (string key in new string[] { "inventory", "stash" })
            {
                object io;
                List<object> inv = gs.TryGetValue(key, out io) ? io as List<object> : null;
                if (inv == null) continue;
                for (int i = 0; i < inv.Count; i++)
                {
                    Dictionary<string, object> item = inv[i] as Dictionary<string, object>;
                    if (item == null) continue;
                    if (IsEquipment(item)) { skipped++; continue; }  // 跳过装备，避免批量把装备数量改成 99
                    item["quantity"] = (double)qty; cnt++;
                }
            }
            RepopulateInv();
            SetStatus("已将背包+仓库物品数量设为 " + qty + "（共 " + cnt + " 条；跳过装备 " + skipped + " 件，记得点“写入修改”）");
            MarkDirty();
        }

        // 判断是否为装备类物品（武器/护甲等）：带 affixes 词缀、或有等级/耐久字段即为装备。
        // 材料/消耗品没有这些字段，保留批量改数量能力。
        static bool IsEquipment(Dictionary<string, object> item)
        {
            if (item == null) return false;
            if (item.ContainsKey("affixes")) return true;   // 词缀（装备专属）
            if (item.ContainsKey("enhanceLevel")) return true;
            if (item.ContainsKey("durability")) return true;
            if (item.ContainsKey("level") && !item.ContainsKey("quantity")) return true;
            return false;
        }

        void RefreshInvLine(int idx)
        {
            if (idx < 0 || idx >= _invItems.Count || _payload == null) return;
            List<object> inv = GetItemList(_invItems[idx].IsStash);
            int ri = _invItems[idx].Index;
            if (inv == null || ri < 0 || ri >= inv.Count) return;
            Dictionary<string, object> item = inv[ri] as Dictionary<string, object>;
            if (item == null) return;
            object qv;
            string qty = item.TryGetValue("quantity", out qv) ? NumDisplay(qv) : "0";
            if (idx < _invList.Items.Count) _invList.Items[idx] = ItemDisplayName(_invItems[idx].DefId) + "  x" + qty;
        }

        List<object> GetItemList(bool stash)
        {
            Dictionary<string, object> gs = GetGameState();
            if (gs == null) return null;
            object io;
            string key = stash ? "stash" : "inventory";
            return gs.TryGetValue(key, out io) ? io as List<object> : null;
        }

        bool CurrentScopeStash()
        {
            return _invScope != null && _invScope.SelectedIndex == 1;
        }

        void RepopulateInv()
        {
            _invList.Items.Clear();
            _invItems.Clear();
            if (_payload == null) return;
            bool stash = CurrentScopeStash();
            List<object> inv = GetItemList(stash);
            if (inv != null)
            {
                for (int i = 0; i < inv.Count; i++)
                {
                    Dictionary<string, object> item = inv[i] as Dictionary<string, object>;
                    if (item == null) continue;
                    object dv, iv, qv;
                    string defId = item.TryGetValue("defId", out dv) ? Convert.ToString(dv) : "?";
                    string iid = item.TryGetValue("instanceId", out iv) ? Convert.ToString(iv) : "";
                    string qty = item.TryGetValue("quantity", out qv) ? NumDisplay(qv) : "0";
                    _invItems.Add(new InvItem(i, defId, iid, stash));
                    _invList.Items.Add(ItemDisplayName(defId) + "  x" + qty);
                }
            }
            if (_invItems.Count == 0) _invList.Items.Add("（无物品）");
        }

        void DoBackup()
        {
            string dir = SavesDir;
            if (!Directory.Exists(dir))
            {
                Msg("存档目录不存在:\n" + dir, "错误", MessageBoxIcon.Error);
                return;
            }
            try
            {
                string backupRoot = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "rh_backups");
                string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                string target = Path.Combine(backupRoot, "backup_" + stamp);
                Directory.CreateDirectory(target);
                int count = 0;
                foreach (string f in Directory.GetFiles(dir, "*.json"))
                    if (!f.EndsWith(".tmp"))
                    {
                        File.Copy(f, Path.Combine(target, Path.GetFileName(f)), true);
                        count++;
                    }
                SetStatus("已备份 " + count + " 个文件 -> " + target);
                Msg("已备份 " + count + " 个文件到:\n" + target, "备份完成", MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Msg("备份失败:\n" + ex.Message, "错误", MessageBoxIcon.Error);
            }
        }

        static long? GetInt(TextBox tb, string name, out bool empty)
        {
            empty = string.IsNullOrWhiteSpace(tb.Text);
            if (empty) return null;
            long v;
            if (long.TryParse(tb.Text.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out v)) return v;
            double d;
            if (double.TryParse(tb.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out d)) return (long)d;
            throw new FormatException("字段 " + name + " 需要整数，得到: " + tb.Text.Trim());
        }

        static double? GetNum(TextBox tb, string name, out bool empty)
        {
            empty = string.IsNullOrWhiteSpace(tb.Text);
            if (empty) return null;
            double d;
            if (double.TryParse(tb.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out d)) return d;
            throw new FormatException("字段 " + name + " 需要数字，得到: " + tb.Text.Trim());
        }

        void DoSave()
        {
            bool gameRunning = GameRunning();
            if (gameRunning && !_silent)
            {
                DialogResult r = MessageBox.Show(this,
                    "检测到游戏正在运行。\n\n" +
                    "写入后游戏将在约 3 秒内【自动重载】并生效（自动返回主菜单→继续游戏）。\n" +
                    "若你在战斗/剧情中，会自动中断回主菜单再继续，属正常现象。\n\n" +
                    "确定继续写入吗？",
                    "游戏正在运行（将自动重载）", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (r != DialogResult.Yes) return;
            }
            if (_env == null || _payload == null)
            {
                Msg("请先读取存档", "未读取", MessageBoxIcon.Warning);
                return;
            }
            // 防护：读取到异常 revision（游戏运行/保存中被替换的档）时拒绝写入，防止覆盖真实存档。
            // 只拦 revision<2（0/1 空档）；正常档（新轮回也是几十、正常档几百上千）不被误拦。
            object revGuard;
            double revNum = _env.TryGetValue("revision", out revGuard) && revGuard is double ? (double)revGuard : 0;
            if (revNum < 2)
            {
                LogWrite("阻止写入：revision 异常 " + revNum);
                Msg("存档 revision 异常（" + revNum + "），可能是游戏正在运行或读取到了错误文件。\n\n已取消写入。请完全关闭游戏后重新打开修改器读取存档（状态栏 revision 应为几百以上的大数）。",
                    "写入已取消", MessageBoxIcon.Warning);
                return;
            }

            Dictionary<string, object> p = _payload;
            Dictionary<string, object> profile = null;
            object pr, pf;
            if (p.TryGetValue("progress", out pr) && pr is Dictionary<string, object>)
            {
                Dictionary<string, object> pd = (Dictionary<string, object>)pr;
                if (pd.TryGetValue("profile", out pf)) profile = pf as Dictionary<string, object>;
            }
            Dictionary<string, object> game = GetGameState();
            Dictionary<string, object> p2 = null;
            object p2o;
            if (game != null && game.TryGetValue("p2", out p2o)) p2 = p2o as Dictionary<string, object>;

            try
            {
                if (profile != null)
                {
                    foreach (KeyValuePair<string, TextBox> kv in _profileEntries)
                    {
                        if (kv.Key == "crystalCores")
                        {
                            // 晶核属于 P2 运行时字段，写入 p2（末世阶段需关游戏）
                            bool ce;
                            long? cv = GetInt(kv.Value, kv.Key, out ce);
                            if (!ce && p2 != null) p2["crystalCores"] = (double)cv.Value;
                            continue;
                        }
                        bool empty;
                        long? v = GetInt(kv.Value, kv.Key, out empty);
                        if (empty) continue;
                        if (kv.Key == "sourceCrystals") profile["sourceCrystals"] = (double)v.Value;
                        else if (kv.Key == "awakeningTalentPoints") profile["awakeningTalentPoints"] = (double)v.Value;
                        else if (kv.Key == "reputation.totalPoints") SetDotted(profile, "reputation.totalPoints", (double)v.Value);
                        else if (kv.Key == "idleSystem.pendingCrystals") SetDotted(profile, "idleSystem.pendingCrystals", (double)v.Value);
                        else if (kv.Key == "reincarnationCount") profile["reincarnationCount"] = (double)v.Value;
                        else if (kv.Key.StartsWith("inheritedStats.")) SetDotted(profile, kv.Key, (double)v.Value);
                    }
                }

                if (game != null)
                {
                    foreach (KeyValuePair<string, TextBox> kv in _runEntries)
                    {
                        if (kv.Key == "mood" && p2 != null)
                        {
                            // P2（末世阶段）界面显示的心情来自 p2.mood，需同时写入两处
                            bool empty;
                            long? v = GetInt(kv.Value, kv.Key, out empty);
                            if (!empty)
                            {
                                game[kv.Key] = (double)v.Value;
                                p2["mood"] = (double)v.Value;
                            }
                            continue;
                        }
                        if (kv.Key == "luckBonus")
                        {
                            bool empty;
                            double? v = GetNum(kv.Value, kv.Key, out empty);
                            if (!empty) game[kv.Key] = v.Value;
                        }
                        else
                        {
                            bool empty;
                            long? v = GetInt(kv.Value, kv.Key, out empty);
                            if (!empty) game[kv.Key] = (double)v.Value;
                        }
                    }
                    if (p2 != null)
                    {
                        foreach (KeyValuePair<string, TextBox> kv in _p2Entries)
                        {
                            bool empty;
                            long? v = GetInt(kv.Value, kv.Key, out empty);
                            if (!empty) p2[kv.Key] = (double)v.Value;
                        }
                    }
                    else
                    {
                        foreach (KeyValuePair<string, TextBox> kv in _p2Entries)
                            if (!string.IsNullOrWhiteSpace(kv.Value.Text))
                                throw new FormatException("当前存档没有 P2 战斗数据，不能修改该字段: " + kv.Key);
                    }
                }
                else
                {
                    foreach (KeyValuePair<string, TextBox> kv in _runEntries)
                        if (!string.IsNullOrWhiteSpace(kv.Value.Text))
                            throw new FormatException("当前存档没有进行中的局，不能修改: " + kv.Key);
                }

                ApplyNewTabsBeforeSave();
            }
            catch (FormatException ex)
            {
                LogWrite("输入错误: " + ex.Message);
                Msg(ex.Message, "输入错误", MessageBoxIcon.Error);
                return;
            }

            string path = SlotFile;
            try
            {
                // 写入前重新读取磁盘上的 revision：若游戏在我们读档后又自动保存过（revision 变大），
                // 直接用内存旧数据回写会丢失游戏期间的进度，这里拦截并提示重新读档。
                object _rg;
                long curRev = _env.TryGetValue("revision", out _rg) && _rg is double ? (long)(double)_rg : 0;
                long diskRev = SaveCodec.ReadRevision(path);
                if (diskRev > curRev)
                {
                    LogWrite("阻止写入：磁盘 revision " + diskRev + " > 读入 revision " + curRev + "（游戏可能已重新保存）");
                    Msg("检测到存档在读取之后被游戏更新过（磁盘 revision " + diskRev + " > 当前 " + curRev + "）。\n\n为防覆盖游戏最新进度，已取消写入。\n请重新读取存档后再修改。",
                        "写入已取消", MessageBoxIcon.Warning);
                    return;
                }

                // 写前自动备份
                string backupRoot = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "rh_backups");
                string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                string target = Path.Combine(backupRoot, "backup_" + stamp);
                Directory.CreateDirectory(target);
                File.Copy(path, Path.Combine(target, Path.GetFileName(path)), true);

                Dictionary<string, object> env = SaveCodec.RebuildEnvelope(_env, p);
                // 原子写：先写入 .tmp，再替换正式文件，避免与游戏自动保存并发写造成损坏
                string tmpPath = path + ".tmp";
                File.WriteAllText(tmpPath, Json.Dump(env, true) + "\n", new UTF8Encoding(false));
                if (File.Exists(path)) { File.Replace(tmpPath, path, null, true); }
                else { File.Move(tmpPath, path); }
                if (gameRunning) WriteApplyMarker();   // 运行中：写自动重载标记，游戏 mod 检测后自动生效
                _env = env;
                object payloadNew;
                _payload = env.TryGetValue("payload", out payloadNew) ? (Dictionary<string, object>)Json.Clone(payloadNew) : null;
                // 写入日志（诊断用）：关键字段摘要
                string sum = "";
                try
                {
                    Dictionary<string, object> np = (Dictionary<string, object>)env["payload"];
                    Dictionary<string, object> npr = (Dictionary<string, object>)np["progress"];
                    object nar;
                    if (npr.TryGetValue("activeRun", out nar) && nar is Dictionary<string, object>)
                    {
                        object ngs;
                        if (((Dictionary<string, object>)nar).TryGetValue("gameState", out ngs) && ngs is Dictionary<string, object>)
                        {
                            object np2;
                            if (((Dictionary<string, object>)ngs).TryGetValue("p2", out np2) && np2 is Dictionary<string, object>)
                            {
                                object v;
                                Dictionary<string, object> pd = (Dictionary<string, object>)np2;
                                sum += "playerLevel=" + (pd.TryGetValue("playerLevel", out v) ? NumDisplay(v) : "?") + " ";
                                sum += "playerExp=" + (pd.TryGetValue("playerExp", out v) ? NumDisplay(v) : "?") + " ";
                                sum += "freePoints=" + (pd.TryGetValue("freeAttributePoints", out v) ? NumDisplay(v) : "?") + " ";
                            }
                        }
                    }
                    object npro;
                    if (npr.TryGetValue("profile", out npro) && npro is Dictionary<string, object>)
                    {
                        object tco;
                        if (((Dictionary<string, object>)npro).TryGetValue("towerCardCollection", out tco) && tco is Dictionary<string, object>)
                        {
                            object ow;
                            if (((Dictionary<string, object>)tco).TryGetValue("owned", out ow) && ow is Dictionary<string, object>)
                            {
                                int gold99 = 0, total = 0;
                                foreach (KeyValuePair<string, object> kv in (Dictionary<string, object>)ow)
                                {
                                    total++;
                                    Dictionary<string, object> c = kv.Value as Dictionary<string, object>;
                                    object gv;
                                    if (c != null && c.TryGetValue("gold", out gv) && gv is double && (double)gv >= 99) gold99++;
                                }
                                sum += "cards=" + total + " gold99=" + gold99;
                            }
                        }
                    }
                }
                catch { }
                MarkClean();
                LogWrite("写入成功 slot=" + _slotBox.SelectedItem + " revision=" + env["revision"] + " | " + sum.Trim());
                SetStatus("已写入 ✓ revision=" + env["revision"]);
                Msg("修改已写入:\n" + path + "\n\nrevision 已 +1，checksum 已重新计算，修改前存档已自动备份。\n启动游戏即可生效（请保持游戏关闭状态）。", "写入成功", MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                LogWrite("写入失败: " + ex.Message);
                Msg("写入失败:\n" + ex.Message, "错误", MessageBoxIcon.Error);
            }
        }

        void SetDotted(Dictionary<string, object> root, string dotted, object value)
        {
            string[] parts = dotted.Split('.');
            Dictionary<string, object> cur = root;
            for (int k = 0; k < parts.Length - 1; k++)
            {
                object nxt;
                Dictionary<string, object> nd = cur.TryGetValue(parts[k], out nxt) ? nxt as Dictionary<string, object> : null;
                if (nd == null)
                {
                    nd = new Dictionary<string, object>();
                    cur[parts[k]] = nd;
                }
                cur = nd;
            }
            cur[parts[parts.Length - 1]] = value;
        }

        [STAThread]
        static void Main()
        {
            string[] args = Environment.GetCommandLineArgs();
            if (args.Length >= 2 && args[1] == "--layoutcheck")
            {
                RunLayoutCheck();
                return;
            }
            if (args.Length >= 3 && args[1] == "--selftest")
            {
                // 自检模式：无头运行 加载→全标签页改值→写入 的完整真实流程
                // 用法: 存档修改器.exe --selftest <存档目录> <输出路径>
                RunSelfTest(args[2], args.Length >= 4 ? args[3] : null);
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            MainForm f = new MainForm();
            f.Shown += delegate(object s, EventArgs e) { if (File.Exists(f.SlotFile)) f.DoLoad(); };
            Application.Run(f);
        }

        // 布局检测：枚举所有控件矩形，报告非父子关系的重叠
        static void RunLayoutCheck()
        {
            try
            {
                MainForm f = new MainForm();
                f.Show();
                Application.DoEvents();
                Console.WriteLine("DBG status text=[" + f._status.Text + "] parent=" + (f._status.Parent == null ? "null" : f._status.Parent.GetType().Name + "@" + f._status.Parent.Bounds) + " status=" + f._status.Bounds);
                List<string> problems = new List<string>();
                CheckOverlaps(f, "默认尺寸", problems);
                f.ClientSize = f.MinimumSize;   // 最小窗口尺寸再查一遍
                Application.DoEvents();
                CheckOverlaps(f, "最小尺寸", problems);
                if (problems.Count == 0)
                {
                    Console.WriteLine("LAYOUTCHECK OK");
                }
                else
                {
                    Console.WriteLine("LAYOUTCHECK 发现 " + problems.Count + " 处重叠:");
                    foreach (string p in problems) Console.WriteLine("  " + p);
                }
                f.Close();
                Environment.Exit(problems.Count == 0 ? 0 : 4);
            }
            catch (Exception ex)
            {
                Console.WriteLine("LAYOUTCHECK FAIL: " + ex);
                Environment.Exit(5);
            }
        }

        static void CheckOverlaps(MainForm f, string tag, List<string> problems)
        {
            List<Control> all = new List<Control>();
            CollectControls(f, all);
            for (int i = 0; i < all.Count; i++)
            {
                for (int j = i + 1; j < all.Count; j++)
                {
                    Control a = all[i], b = all[j];
                    if (IsAncestor(a, b) || IsAncestor(b, a)) continue;
                    Rectangle ra = AbsBounds(a, f);
                    Rectangle rb = AbsBounds(b, f);
                    Rectangle inter = Rectangle.Intersect(ra, rb);
                    if (inter.Width > 2 && inter.Height > 2)
                    {
                        double area = (double)inter.Width * inter.Height;
                        if (area > 60)
                        {
                            string pageA = PageOf(a), pageB = PageOf(b);
                            if (pageA == pageB)
                                problems.Add(string.Format("[{0}][{1}] {2}@{3} 与 {4}@{5} 重叠 {6}x{7}", tag, pageA, Describe(a), ra, Describe(b), rb, inter.Width, inter.Height));
                        }
                    }
                }
            }
        }

        static void CollectControls(Control root, List<Control> list)
        {
            foreach (Control c in root.Controls)
            {
                list.Add(c);
                CollectControls(c, list);
            }
        }

        static bool IsAncestor(Control p, Control c)
        {
            Control cur = c.Parent;
            while (cur != null)
            {
                if (cur == p) return true;
                cur = cur.Parent;
            }
            return false;
        }

        static Rectangle AbsBounds(Control c, Control root)
        {
            Point p = c.Location;
            Control parent = c.Parent;
            while (parent != null && parent != root)
            {
                p.Offset(parent.Location);
                parent = parent.Parent;
            }
            return new Rectangle(p, c.Size);
        }

        static string PageOf(Control c)
        {
            Control cur = c;
            while (cur != null)
            {
                if (cur is TabPage) return cur.Text;
                cur = cur.Parent;
            }
            return "窗体";
        }

        static string Describe(Control c)
        {
            string t = "";
            if (c is Label) t = ((Label)c).Text;
            else if (c is Button) t = ((Button)c).Text;
            else if (c is GroupBox) t = ((GroupBox)c).Text;
            else if (c is CheckBox) t = ((CheckBox)c).Text;
            if (t.Length > 18) t = t.Substring(0, 18);
            return c.GetType().Name + "[" + t + "]";
        }

        // 无头自检：构造 UI（验证不崩溃）→ 加载存档 → 改全部标签页 → 写入
        static void RunSelfTest(string saveDir, string outPath)
        {
            try
            {
                _silent = true;
                MainForm f = new MainForm();
                f._dirBox.Text = saveDir;
                f._slotBox.SelectedIndex = 0;
                f.DoLoad();
                if (f._payload == null) { Console.WriteLine("SELFTEST FAIL: 未加载到存档"); Environment.Exit(2); }

                // ---- 角色/全局 ----
                f._profileEntries["sourceCrystals"].Text = "99999";
                f._profileEntries["awakeningTalentPoints"].Text = "50";
                f._profileEntries["reputation.totalPoints"].Text = "100";
                f._profileEntries["idleSystem.pendingCrystals"].Text = "500";
                f._profileEntries["reincarnationCount"].Text = "10";
                f._profileEntries["inheritedStats.maxHp"].Text = "999";
                f._profileEntries["inheritedStats.attack"].Text = "888";
                // ---- 当前局 ----
                f._runEntries["cash"].Text = "123456";
                f._runEntries["mood"].Text = "99";
                f._runEntries["daysRemaining"].Text = "30";
                f._runEntries["hoursRemaining"].Text = "12";
                f._runEntries["creditScore"].Text = "5000";
                f._runEntries["emergencyReviveCharges"].Text = "3";
                f._runEntries["vehicleLevel"].Text = "200";
                f._runEntries["backpackLevel"].Text = "20";
                f._runEntries["luckBonus"].Text = "0.5";
                // ---- P2 战斗 ----
                f._p2Entries["hp"].Text = "9999";
                f._p2Entries["maxHp"].Text = "10000";
                f._p2Entries["attack"].Text = "500";
                f._p2Entries["defense"].Text = "300";
                f._p2Entries["fuel"].Text = "100";
                f._p2Entries["maxFuel"].Text = "200";
                f._p2Entries["ammo"].Text = "500";
                f._p2Entries["maxAmmo"].Text = "1000";
                // ---- 物品：全部 99，再第一件 77 ----
                f.FillAllInv(99);
                if (f._invItems.Count > 0)
                {
                    f._invList.SelectedIndex = 0;
                    f._invQty.Value = 77;
                    f.ApplyInvQty();
                }
                // ---- 角色属性 ----
                f._charEntries["playerLevel"].Text = "66";
                f._charEntries["playerExp"].Text = "777777";
                f._charEntries["freeAttributePoints"].Text = "25";
                f._charEntries["primaryAttributes.strength"].Text = "88";
                f._charEntries["primaryAttributes.agility"].Text = "66";
                f._charEntries["primaryAttributes.constitution"].Text = "77";
                f._charEntries["primaryAttributes.perception"].Text = "55";
                // ---- 卡牌：一键全部 99，再第一张 白3绿4蓝5紫6金99 ----
                f.FillAllCards(99);
                if (f._cardIds.Count > 0)
                {
                    f._cardList.SelectedIndex = 0;
                    f._cardWhite.Value = 3; f._cardGreen.Value = 4; f._cardBlue.Value = 5;
                    f._cardPurple.Value = 6; f._cardGold.Value = 99;
                    f.ApplyCardToPayload();
                }
                // ---- 装备：第一件强化 15 / 等级 50 / 传说 / 首条词缀 42 ----
                if (f._equipIndexes.Count > 0)
                {
                    f._equipList.SelectedIndex = 0;
                    f._equipEnhance.Text = "15";
                    f._equipLevel.Text = "50";
                    f._equipRarity.Text = "legendary";
                    f.ApplyEquipToPayload();
                    if (f._equipAffixes.Rows.Count > 0)
                    {
                        f._equipAffixes.Rows[0].Cells[1].Value = "42";
                        f.ApplyEquipToPayload();
                    }
                }
                // ---- 命途 ----
                f._routeText.Text = "combat";
                f._routePending.Text = "7";
                f._routeMilestone.Text = "60";
                f.ApplyRouteToPayload();
                // ---- 医疗舱 ----
                f._medEntries["awakeningStage"].Text = "3";
                f._medEntries["awakeningExpMultiplier"].Text = "2.5";
                f._medEntries["cloneAge"].Text = "40";
                f._medEntries["telomereOverloadDebt"].Text = "100";
                // ---- 写入（自动应用全部条目 + 装备/卡牌/命途核心） ----
                f.DoSave();
                if (outPath != null && File.Exists(f.SlotFile))
                {
                    File.Copy(f.SlotFile, outPath, true);
                }
                Console.WriteLine("SELFTEST OK");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Console.WriteLine("SELFTEST FAIL: " + ex);
                Environment.Exit(3);
            }
        }
    }
}
