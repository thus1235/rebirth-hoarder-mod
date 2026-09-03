// 测试入口（仅构建阶段使用）：验证校验和算法与真实存档一致 + 修改往返测试
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace RhSaveTrainer
{
    public static class TestMain
    {
        public static int Main(string[] args)
        {
            try
            {
                if (args.Length >= 1 && args[0] == "names")
                {
                    // names : 验证中文名映射解析
                    string[] ids = { "gatling_gun", "ar_winter", "ac_chip_atk", "mat_weapon_parts", "medkit",
                        "adrenaline_rush", "combat_bandage", "water_bottle", "ruin_locator" };
                    foreach (string id in ids)
                        Console.WriteLine(id + " -> " + MainForm.ItemDisplayName(id));
                    Console.WriteLine("rarity legendary -> " + MainForm.RarityName("legendary"));
                    Console.WriteLine("rarity artifact -> " + MainForm.RarityName("artifact"));
                    Console.WriteLine("rarity common -> " + MainForm.RarityName("common"));
                    Console.WriteLine("route casual -> " + MainForm.RouteDisplay("casual"));
                    Console.WriteLine("skill scout -> " + MainForm.SkillDisplay("scout"));
                    return 0;
                }
                else if (args.Length >= 2 && args[0] == "fmt")
                {
                    // fmt <file> : 逐行读取 double，输出 FmtDouble 结果（用于与 Python repr 对拍）
                    string[] lines = File.ReadAllLines(args[1]);
                    foreach (string ln in lines)
                    {
                        string t = ln.Trim();
                        if (t.Length == 0) continue;
                        double d = Json.ParseNumberExact(t);
                        Console.WriteLine(Json.FmtDouble(d));
                    }
                    return 0;
                }
                else if (args.Length >= 2 && args[0] == "check")
                {
                    // check <savefile> : 校验 checksum
                    Dictionary<string, object> env = (Dictionary<string, object>)Json.Parse(File.ReadAllText(args[1], Encoding.UTF8));
                    Dictionary<string, object> payload = (Dictionary<string, object>)env["payload"];
                    string calc = SaveCodec.CreateChecksum(payload);
                    object storedObj;
                    string stored = env.TryGetValue("checksum", out storedObj) ? Convert.ToString(storedObj) : "";
                    Console.WriteLine("computed: " + calc);
                    Console.WriteLine("stored  : " + stored);
                    Console.WriteLine(calc == stored ? "CHECKSUM MATCH" : "CHECKSUM MISMATCH");
                    return calc == stored ? 0 : 2;
                }
                else if (args.Length >= 3 && args[0] == "compact")
                {
                    // compact <save> <outfile> : 导出 checksum 输入串（紧凑序列化）用于逐字节对比
                    Dictionary<string, object> env = (Dictionary<string, object>)Json.Parse(File.ReadAllText(args[1], Encoding.UTF8));
                    Dictionary<string, object> payload = (Dictionary<string, object>)env["payload"];
                    string s = SaveCodec.SerializePayload(payload);
                    File.WriteAllText(args[2], s, new UTF8Encoding(false));
                    Console.WriteLine("compact length: " + s.Length);
                    return 0;
                }
                else if (args.Length >= 3 && args[0] == "probe")
                {
                    // probe <in> <out> : 只改 人物等级/经验 + 一张卡牌金卡数量，用于实测游戏加载行为
                    Dictionary<string, object> env = (Dictionary<string, object>)Json.Parse(File.ReadAllText(args[1], Encoding.UTF8));
                    Dictionary<string, object> payload = (Dictionary<string, object>)env["payload"];
                    Dictionary<string, object> progress = (Dictionary<string, object>)payload["progress"];
                    Dictionary<string, object> activeRun = (Dictionary<string, object>)progress["activeRun"];
                    Dictionary<string, object> game = (Dictionary<string, object>)activeRun["gameState"];
                    Dictionary<string, object> p2 = (Dictionary<string, object>)game["p2"];
                    p2["playerLevel"] = 100.0;
                    p2["playerExp"] = 999999.0;
                    Dictionary<string, object> profile = (Dictionary<string, object>)progress["profile"];
                    Dictionary<string, object> tc = (Dictionary<string, object>)profile["towerCardCollection"];
                    Dictionary<string, object> owned = (Dictionary<string, object>)tc["owned"];
                    object co;
                    Dictionary<string, object> card = owned.TryGetValue("adrenaline_rush", out co) ? co as Dictionary<string, object> : null;
                    if (card == null) { Console.WriteLine("ERROR: adrenaline_rush not found"); return 3; }
                    card["gold"] = 99.0;
                    Dictionary<string, object> ne = SaveCodec.RebuildEnvelope(env, payload);
                    File.WriteAllText(args[2], Json.Dump(ne, true) + "\n", new UTF8Encoding(false));
                    Console.WriteLine("probe written: " + args[2]);
                    return 0;
                }
                else if (args.Length >= 3 && args[0] == "editnew")
                {
                    // editnew <in> <out> : 模拟新版 UI 的修改路径（等级/属性/医疗舱/命途/卡牌/装备）并写出
                    Dictionary<string, object> env = (Dictionary<string, object>)Json.Parse(File.ReadAllText(args[1], Encoding.UTF8));
                    Dictionary<string, object> payload = (Dictionary<string, object>)env["payload"];
                    Dictionary<string, object> progress = (Dictionary<string, object>)payload["progress"];
                    Dictionary<string, object> activeRun = (Dictionary<string, object>)progress["activeRun"];
                    Dictionary<string, object> game = (Dictionary<string, object>)activeRun["gameState"];
                    Dictionary<string, object> p2 = (Dictionary<string, object>)game["p2"];
                    p2["playerLevel"] = 100.0;
                    p2["playerExp"] = 999999.0;
                    p2["freeAttributePoints"] = 50.0;
                    ((Dictionary<string, object>)p2["primaryAttributes"])["strength"] = 100.0;
                    p2["awakeningStage"] = 2.0;
                    p2["cloneAge"] = 30.0;
                    Dictionary<string, object> sp = (Dictionary<string, object>)p2["specialization"];
                    sp["pendingChoices"] = 5.0;
                    ((Dictionary<string, object>)sp["skillLevels"])["prospect"] = 10.0;
                    Dictionary<string, object> profile = (Dictionary<string, object>)progress["profile"];
                    Dictionary<string, object> tc = (Dictionary<string, object>)profile["towerCardCollection"];
                    Dictionary<string, object> owned = (Dictionary<string, object>)tc["owned"];
                    foreach (KeyValuePair<string, object> kv in owned)
                    {
                        ((Dictionary<string, object>)kv.Value)["gold"] = 99.0;
                        break;
                    }
                    List<object> inv = (List<object>)game["inventory"];
                    foreach (object io in inv)
                    {
                        Dictionary<string, object> item = io as Dictionary<string, object>;
                        if (item == null) continue;
                        if (item.ContainsKey("rarity") || item.ContainsKey("affixes") || item.ContainsKey("enhanceLevel"))
                        {
                            item["enhanceLevel"] = 15.0;
                            object ao;
                            if (item.TryGetValue("affixes", out ao) && ao is List<object>)
                            {
                                List<object> affixes = (List<object>)ao;
                                if (affixes.Count > 0 && affixes[0] is Dictionary<string, object>)
                                    ((Dictionary<string, object>)affixes[0])["value"] = 50.0;
                            }
                            break;
                        }
                    }
                    Dictionary<string, object> ne = SaveCodec.RebuildEnvelope(env, payload);
                    File.WriteAllText(args[2], Json.Dump(ne, true) + "\n", new UTF8Encoding(false));
                    Console.WriteLine("written: " + args[2]);
                    Console.WriteLine("checksum: " + ne["checksum"]);
                    return 0;
                }
                else if (args.Length >= 4 && args[0] == "modify")
                {
                    // modify <in> <out> <key> <value> : 修改 activeRun.gameState.<key> 后重建封套并写出
                    Dictionary<string, object> env = (Dictionary<string, object>)Json.Parse(File.ReadAllText(args[1], Encoding.UTF8));
                    Dictionary<string, object> payload = (Dictionary<string, object>)env["payload"];
                    Dictionary<string, object> progress = (Dictionary<string, object>)payload["progress"];
                    object ar;
                    Dictionary<string, object> activeRun = progress.TryGetValue("activeRun", out ar) ? ar as Dictionary<string, object> : null;
                    if (activeRun == null) { Console.WriteLine("ERROR: no activeRun"); return 3; }
                    object gs;
                    Dictionary<string, object> game = activeRun.TryGetValue("gameState", out gs) ? gs as Dictionary<string, object> : null;
                    if (game == null) { Console.WriteLine("ERROR: no gameState"); return 3; }
                    double val = double.Parse(args[4], CultureInfo.InvariantCulture);
                    game[args[3]] = val;
                    Dictionary<string, object> ne = SaveCodec.RebuildEnvelope(env, payload);
                    File.WriteAllText(args[2], Json.Dump(ne, true) + "\n", new UTF8Encoding(false));
                    Console.WriteLine("written: " + args[2]);
                    Console.WriteLine("checksum: " + ne["checksum"]);
                    Console.WriteLine("revision: " + ne["revision"]);
                    return 0;
                }
                else
                {
                    Console.WriteLine("usage: check <savefile> | modify <in> <out> <key> <value>");
                    return 1;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERROR: " + ex);
                return 9;
            }
        }
    }
}
