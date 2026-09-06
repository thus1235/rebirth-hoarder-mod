// lang.cs - 存档修改器双语模块（v3.19：简体中文 / English 可切换）
// 设计：
//   · 界面文案统一以中文原文为 key；中文模式下去掉字段名后缀的英文键（如「源晶 sourceCrystals」→「源晶」），
//     英文模式查 EN 字典（未收录的回退中文），显示层翻译，不影响以中文原文为键的存取逻辑。
//   · Walk() 在窗体构建完成后遍历控件树统一翻译（Label/Button/CheckBox/GroupBox/TabPage/下拉框/表格列头）。
//   · 切换语言 = 保存偏好文件 + Application.Restart()，所有动态文案随重建回归新语言。
//   · SetStatus/Msg 的动态消息经 S() 做前后缀模板替换，覆盖最常用的操作反馈。
using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;

namespace RhSaveTrainer
{
    public static class Lang
    {
        public static bool En;
        static readonly string PrefFile;
        static readonly Dictionary<string, string> EN = new Dictionary<string, string>();

        static Lang()
        {
            try { PrefFile = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "rh_editor_lang.txt"); }
            catch { PrefFile = null; }
            if (PrefFile != null && File.Exists(PrefFile))
            {
                try { En = File.ReadAllText(PrefFile).Trim() == "en"; } catch { }
            }
            InitDict();
        }

        public static void ToggleAndRestart()
        {
            En = !En;
            if (PrefFile != null) { try { File.WriteAllText(PrefFile, En ? "en" : "zh"); } catch { } }
            Application.Restart();
        }

        // 中文显示：去掉字段标签尾部空格后的英文键（仅当其后是纯 ASCII 标识符，避免误伤「全部设为 99」）
        static string ZhStrip(string key)
        {
            int i = key.IndexOf(' ');
            if (i <= 0) return key;
            string tail = key.Substring(i + 1);
            if (tail.Length == 0) return key;
            foreach (char c in tail)
            {
                if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z') && !(c >= '0' && c <= '9') && c != '_' && c != '.')
                    return key;
            }
            return key.Substring(0, i);
        }

        public static string L(string key)
        {
            if (!En) return ZhStrip(key);
            string en;
            return EN.TryGetValue(key, out en) ? en : ZhStrip(key);
        }

        // 动态状态/消息翻译：按前后缀模板替换（覆盖高频操作反馈；未命中原文返回）
        public static string S(string s)
        {
            if (!En || s == null) return s;
            string outS = s;
            string[,] rules = {
                { "已读取（", "Loaded (" },
                { "存档 revision 异常（", "Save revision error (" },
                { "未找到存档: ", "Save not found: " },
                { "已写入 ✓ revision=", "Written ✓ revision=" },
                { "已写入自动重载标记", "Auto-reload marker written" },
                { "阻止写入：revision 异常 ", "Write blocked: revision error " },
                { "阻止写入：磁盘 revision ", "Write blocked: disk revision " },
                { "当前存档没有 P2 战斗数据，不能修改该字段: ", "No P2 combat data; cannot edit: " },
                { "当前存档没有 P2 数据，不能修改该字段: ", "No P2 data; cannot edit: " },
                { "当前存档没有进行中的局，不能修改: ", "No active run; cannot edit: " },
                { "字段 ", "Field " },
                { " 需要数字: ", " expects a number: " },
                { " 需要整数，得到: ", " expects an integer, got: " },
                { " 需要数字，得到: ", " expects a number, got: " },
                { "需要数字: ", "number required: " },
                { "，得到: ", ", got: " },
                { "标记写入失败: ", "Marker write failed: " },
                { "存档缺少 payload", "Save missing payload" },
                { "存档含有非有限数字", "Save contains non-finite numbers" },
                { "警告：读取到异常 revision=", "Warning: abnormal revision=" },
                { " 数量 = ", " quantity = " },
                { "LAYOUTCHECK 发现 ", "LAYOUTCHECK found " },
                { " 处重叠:", " overlap(s):" },
                { "，可能是游戏正在运行或读取到了错误文件。", ", possibly because the game is running or the file is corrupt." },
                { "） revision", ") revision" },
                { "就绪。请先关闭游戏再修改存档。", "Ready. Please close the game before editing saves." },
                { "已备份 ", "Backed up " },
                { " 个文件 -> ", " file(s) -> " },
                { "已修改 ", "Modified " },
                { "已添加 ", "Added " },
                { "已删除 ", "Deleted " },
                { "已将背包+仓库物品数量设为 ", "Set inventory+stash quantity to " },
                { "（共 ", " (" },
                { " 条；跳过装备 ", " entries; " },
                { " 件，记得点“写入修改”）", " gear skipped, click Write Changes)" },
                { "，记得点“写入修改”", ", click \"Write Changes\"" },
                { "（记得点“写入修改”）", " (click \"Write Changes\")" },
                { "（背包）", " (inventory)" },
                { "（仓库）", " (stash)" },
                { "（装备，背包）", " (gear, inventory)" },
                { "，记得点“写入修改”", ", click \"Write Changes\"" },
                { "写入成功 slot=", "Written slot=" },
                { "写入成功", "Written" },
                { "写入失败: ", "Write failed: " },
                { "读取失败: ", "Load failed: " },
                { "备份失败:\n", "Backup failed:\n" },
                { "读取存档 slot=", "Loaded slot=" },
                { "存档文件不存在:\n", "Save file not found:\n" },
                { "存档目录不存在:\n", "Save directory not found:\n" },
                { "请先读取存档", "Load a save first" },
                { "请先在「物品」页选中要删除的物品", "Select an item on the Items tab first" },
                { "请先在列表里选中一个物品（或双击直接加入）", "Select an item in the list first (or double-click to add)" },
                { "物品索引异常，请重新读取存档", "Item index error, please reload the save" },
                { "当前存档没有进行中的局", "No active run in this save" },
                { "写入已取消", "Write cancelled" },
                { "请先在左侧选择一件装备", "Select an equipment on the left first" },
                { "请先在左侧选择一张卡牌", "Select a card on the left first" },
                { "已应用装备修改", "Equipment changes applied" },
                { "已应用卡牌修改", "Card changes applied" },
                { "已应用命途修改", "Destiny changes applied" },
                { "已将全部卡牌各稀有度设为 ", "Set all cards every rarity to " },
                { "已将全部卡牌金色设为 ", "Set all cards gold to " },
                { "等级联动: 经验不足，已自动设为 ", "Level synced: not enough exp, auto-set to " },
                { "槽位：未装备", "Slot: unequipped" },
                { "槽位：", "Slot: " },
                { "词缀名：", "Affix: " }
            };
            for (int i = 0; i < rules.GetLength(0); i++) outS = outS.Replace(rules[i, 0], rules[i, 1]);
            return outS;
        }

        // 遍历控件树翻译显示文本（存储键不受影响）
        public static void Walk(Control root)
        {
            Form f = root as Form;
            if (f != null) f.Text = L("末世：我有一辆房车 - 存档修改器 v3.19（免环境版）");
            WalkInner(root);
        }

        static void WalkInner(Control c)
        {
            Label lb = c as Label;
            Button bn = c as Button;
            CheckBox cb = c as CheckBox;
            GroupBox gb = c as GroupBox;
            TabPage tp = c as TabPage;
            ComboBox combo = c as ComboBox;
            if (lb != null) lb.Text = L(lb.Text);
            else if (bn != null) bn.Text = L(bn.Text);
            else if (cb != null) cb.Text = L(cb.Text);
            else if (gb != null) gb.Text = L(gb.Text);
            else if (tp != null) tp.Text = L(tp.Text);
            else if (combo != null)
            {
                for (int i = 0; i < combo.Items.Count; i++)
                {
                    string it = combo.Items[i] as string;
                    if (it != null) combo.Items[i] = L(it);
                }
            }
            DataGridView dg = c as DataGridView;
            if (dg != null)
            {
                foreach (DataGridViewColumn col in dg.Columns)
                {
                    string en;
                    if (EN.TryGetValue(col.HeaderText.ToString(), out en)) col.HeaderText = En ? en : ZhStrip(col.HeaderText.ToString());
                }
            }
            foreach (Control child in c.Controls) WalkInner(child);
        }

        static void Add(string zh, string en) { EN[zh] = en; }

        static void InitDict()
        {
            // ===== 窗体 / 顶部 =====
            Add("末世：我有一辆房车 - 存档修改器 v3.19（免环境版）", "Rebirth Hoarder - Save Editor v3.19 (portable)");
            Add("存档目录:", "Save folder:");
            Add("浏览…", "Browse…");
            Add("打开目录", "Open folder");
            Add("存档槽位:", "Save slot:");
            Add("读取存档", "Load save");
            Add("备份存档", "Backup save");
            Add("写入修改", "Write Changes");
            Add("写入修改 ●", "Write Changes ●");
            Add("就绪。请先关闭游戏再修改存档。", "Ready. Please close the game before editing saves.");
            Add("标签颜色：●绿=局内可改（运行中写入自动生效）　●红=局外可改（需关闭游戏后修改）。写入自动备份、自动重算校验和。",
                "Tab color: green = editable while game runs (auto reloads), red = close the game first. Writing auto-backups and recalculates the checksum.");

            // ===== 页签 =====
            Add("角色 / 全局", "Profile / Global");
            Add("当前局", "Current Run");
            Add("P2 战斗", "P2 Combat");
            Add("物品", "Items");
            Add("添加物品", "Add Items");
            Add("角色属性", "Character");
            Add("装备", "Equipment");
            Add("卡牌", "Cards");
            Add("命途", "Destiny");
            Add("医疗舱", "Med Bay");

            // ===== 物品页 =====
            Add("🔍 过滤:", "Filter:");
            Add("显示：", "Show:");
            Add("背包 inventory", "Inventory");
            Add("仓库 stash", "Stash");
            Add("数量 quantity:", "Quantity:");
            Add("应用到选中物品", "Apply to selected");
            Add("全部设为 99", "Set all to 99");
            Add("全部设为 999", "Set all to 999");
            Add("全部设为：", "Set all to:");
            Add("✅ 应用到全部物品", "Apply to ALL items");
            Add("提示：修改物品数量后需点\n“应用到选中物品”或“全部设\n为”再点“写入修改”。",
                "Tip: after editing quantities click\n\"Apply to selected\" or \"Set all\",\nthen \"Write Changes\".");
            Add("（无物品）", "(no items)");
            Add("（无匹配物品）", "(no matching items)");
            Add("（未读取存档）", "(save not loaded)");

            // ===== 添加物品页 =====
            Add("🔍 像搜索引擎一样找物品：\n支持中文 / ID / 拼音首字母（如 zdylb=战地医疗包）/ 模糊输入 / 空格分多词。\n双击条目直接加入；回车加入第一个结果。",
                "Search items like a search engine:\nChinese / ID / pinyin initials (zdylb = medkit) / fuzzy / multi-word.\nDouble-click to add; Enter adds the first result.");
            Add("数量:", "Quantity:");
            Add("加入:", "Add to:");
            Add("背包", "Inventory");
            Add("仓库", "Stash");
            Add("⚔️ 装备参数（选中武器/护甲/饰品\n时生效，固定加入背包）", "⚔️ Gear options (for weapons/armor/\naccessories; always added to inventory)");
            Add("等级(1~99):", "Level (1-99):");
            Add("强化(0~10):", "Enhance (0-10):");
            Add("改造(0~30):", "Upgrade (0-30):");
            Add("稀有度:", "Rarity:");
            Add("默认（按物品定义）", "Default (by item def)");
            Add("普通 common", "Common");
            Add("精良 uncommon", "Uncommon");
            Add("稀有 rare", "Rare");
            Add("史诗 epic", "Epic");
            Add("传说 legendary", "Legendary");
            Add("神器 artifact", "Artifact");
            Add("➕ 添加到存档", "Add to save");
            Add("🗑 删除「物品」页选中物品", "Delete selected on Items tab");
            Add("（无匹配物品，换个关键词试试）", "(no match, try another keyword)");

            // ===== 角色 / 全局 =====
            Add("角色全局属性　⚡ 局内可改（运行中自动生效）", "Profile globals　⚡ live-editable (auto reloads)");
            Add("源晶 sourceCrystals", "Source Crystals (sourceCrystals)");
            Add("晶核 crystalCores", "Crystal Cores (crystalCores)");
            Add("觉醒天赋点 awakeningTalentPoints", "Awakening Talents (awakeningTalentPoints)");
            Add("声望总点数 reputation.totalPoints", "Reputation (reputation.totalPoints)");
            Add("挂机待领源晶 idleSystem.pendingCrystals", "Idle crystals (idleSystem.pendingCrystals)");
            Add("重生次数 reincarnationCount", "Rebirths (reincarnationCount)");
            Add("继承-最大生命 inheritedStats.maxHp", "Inherit Max HP (inheritedStats.maxHp)");
            Add("继承-攻击 inheritedStats.attack", "Inherit Attack (inheritedStats.attack)");
            Add("继承-防御 inheritedStats.defense", "Inherit Defense (inheritedStats.defense)");
            Add("继承-最大饥饿 inheritedStats.maxHunger", "Inherit Max Hunger (inheritedStats.maxHunger)");
            Add("继承-最大口渴 inheritedStats.maxThirst", "Inherit Max Thirst (inheritedStats.maxThirst)");

            // ===== 当前局 =====
            Add("当前局数值　🔒 局外可改（需关闭游戏）", "Current run　🔒 close game to edit");
            Add("现金 cash", "Cash (cash)");
            Add("心情 mood", "Mood (mood)");
            Add("剩余天数 daysRemaining", "Days left (daysRemaining)");
            Add("剩余小时 hoursRemaining", "Hours left (hoursRemaining)");
            Add("信用分 creditScore", "Credit score (creditScore)");
            Add("紧急复活次数 emergencyReviveCharges", "Emergency revives (emergencyReviveCharges)");
            Add("房车等级 vehicleLevel", "RV level (vehicleLevel)");
            Add("背包等级 backpackLevel", "Backpack level (backpackLevel)");
            Add("幸运加成 luckBonus", "Luck bonus (luckBonus)");

            // ===== P2 战斗 =====
            Add("P2 战斗属性　🔒 局外可改（需关闭游戏）", "P2 combat　🔒 close game to edit");
            Add("生命 hp", "HP (hp)");
            Add("最大生命 maxHp", "Max HP (maxHp)");
            Add("攻击 attack", "Attack (attack)");
            Add("防御 defense", "Defense (defense)");
            Add("燃料 fuel", "Fuel (fuel)");
            Add("最大燃料 maxFuel", "Max fuel (maxFuel)");
            Add("弹药 ammo", "Ammo (ammo)");
            Add("最大弹药 maxAmmo", "Max ammo (maxAmmo)");

            // ===== 角色属性 =====
            Add("人物等级 / 属性点　🔒 局外可改（需关闭游戏）", "Level / attribute points　🔒 close game to edit");
            Add("属性点上限：读取存档后显示。", "Attribute cap: shown after loading a save.");
            Add("玩家等级 playerLevel", "Player level (playerLevel)");
            Add("经验 playerExp", "Experience (playerExp)");
            Add("自由属性点 freeAttributePoints", "Free points (freeAttributePoints)");
            Add("力量 primaryAttributes.strength", "Strength (primaryAttributes.strength)");
            Add("敏捷 primaryAttributes.agility", "Agility (primaryAttributes.agility)");
            Add("体质 primaryAttributes.constitution", "Constitution (primaryAttributes.constitution)");
            Add("感知 primaryAttributes.perception", "Perception (primaryAttributes.perception)");
            Add("提示：生命/攻击/防御是游戏按属性点、等级、装备实时重算的派生值，直接改会被覆盖。请改「角色属性」页的属性点或等级、装备来提升。",
                "Tip: HP/Attack/Defense are derived by the game from points, level and gear; direct edits get overwritten. Raise them via the Character tab, level or equipment.");

            // ===== 装备 =====
            Add("槽位：-", "Slot: -");
            Add("词缀名：-", "Affix: -");
            Add("锁定（不可分解/出售）", "Locked (no scrap/sell)");
            Add("词缀（左侧ID只读，右侧数值可改）：", "Affixes (ID read-only, value editable):");
            Add("应用到选中装备", "Apply to selected gear");
            Add("神器锻造（局外可改）：解锁后可在游戏内装备工坊把对应金装锻造成神器。",
                "Artifact forging (close game to edit): after unlocking, gold gear can be forged into artifacts in-game.");
            Add("🔓 解锁全部 9 件神器锻造（写入时自动达标）", "🔓 Unlock all 9 artifact forgings (auto-met on write)");
            Add("词缀ID", "Affix ID");
            Add("数值", "Value");
            Add("名称", "Name");
            Add("（无装备）", "(no equipment)");
            Add("等级 level", "Level (level)");
            Add("强化 enhanceLevel", "Enhance (enhanceLevel)");
            Add("升级 upgradeLevel", "Upgrade (upgradeLevel)");
            Add("耐久 durability", "Durability (durability)");
            Add("稀有度 rarity", "Rarity (rarity)");
            Add("品质 qualityTier", "Quality (qualityTier)");

            // ===== 卡牌 =====
            Add("白色 white", "White (white)");
            Add("绿色 green", "Green (green)");
            Add("蓝色 blue", "Blue (blue)");
            Add("紫色 purple", "Purple (purple)");
            Add("金色 gold", "Gold (gold)");
            Add("应用到选中卡牌", "Apply to selected card");
            Add("全部卡牌各稀有度=99", "All cards all rarities = 99");
            Add("全部卡牌金色=99", "All cards gold = 99");
            Add("（无卡牌）", "(no cards)");

            // ===== 命途 =====
            Add("命途　🔒 局外可改（需关闭游戏）", "Destiny　🔒 close game to edit");
            Add("路线 selectedRoute", "Route (selectedRoute)");
            Add("待分配点数 pendingChoices", "Pending points (pendingChoices)");
            Add("已处理里程碑等级 processedMilestoneLevel", "Milestones done (processedMilestoneLevel)");
            Add("（中文名）", "(Chinese name)");
            Add("命格注入（技能ID / 名称 / 等级，可增删行）：", "Skill injection (ID / name / level, rows editable):");
            Add("技能ID", "Skill ID");
            Add("应用到命途", "Apply to destiny");

            // ===== 医疗舱 =====
            Add("医疗舱　🔒 局外可改（需关闭游戏）", "Med Bay　🔒 close game to edit");
            Add("觉醒阶段 awakeningStage", "Awakening stage (awakeningStage)");
            Add("觉醒经验倍率 awakeningExpMultiplier", "Awakening exp mult (awakeningExpMultiplier)");
            Add("克隆年龄 cloneAge", "Clone age (cloneAge)");
            Add("端粒过载债务 telomereOverloadDebt", "Telomere debt (telomereOverloadDebt)");

            // ===== 对话框标题 / 通用 =====
            Add("提示", "Info");
            Add("警告", "Warning");
            Add("错误", "Error");
            Add("异常", "Error");
            Add("输入错误", "Input error");
            Add("写入成功", "Write succeeded");
            Add("备份完成", "Backup complete");
            Add("阻止", "Blocked");
            Add("修改已写入:\n", "Changes written:\n");
            Add("写入后游戏将在约 3 秒内【自动重载】并生效（自动返回主菜单→继续游戏）。\n", "The game will auto-reload in ~3 seconds after writing (returns to main menu then continues).\n");
            Add("检测到游戏正在运行。\n\n", "The game is running.\n\n");
            Add("若你在战斗/剧情中，会自动中断回主菜单再继续，属正常现象。\n\n", "If you are in combat/story it will return to the main menu and resume - this is normal.\n\n");
            Add("确定继续写入吗？", "Continue writing?");
            Add("警告：现有 checksum 不匹配（存档可能已被修改过）", "Warning: checksum mismatch (save may have been modified)");
            Add("警告：存档 revision=", "Warning: save revision=");
            Add("检测到存档在读取之后被游戏更新过（磁盘 revision ", "The save changed on disk after it was loaded (disk revision ");
            Add("）。\n\n为防覆盖游戏最新进度，已取消写入。\n请重新读取存档后再修改。", ").\n\nWrite cancelled to avoid overwriting newer progress.\nPlease reload the save and edit again.");
            Add("）。超过会被游戏重置，建议四项额外加成合计 ≤ ", "). Higher values get reset by the game; keep the four bonus totals ≤ ");
            Add("点，或调高等级。", " points, or raise the level.");
            Add("（支撑 Lv.", "(supports Lv.");
            Add("（游戏可能已重新保存）", " (the game may have re-saved)");
            Add("异常！可能游戏正在运行或读取到错误文件，修改将被阻止。", "! The game may be running or the file is corrupt; editing is blocked.");
            Add("（游戏正在运行）", "(game running)");
            Add("未装备", "unequipped");
            Add("武器", "Weapon");
            Add("护甲", "Armor");
            Add("饰品", "Accessory");
            Add("（中文名）", "(Chinese name)");
            Add("槽位：", "Slot: ");
            Add("词缀名：", "Affix: ");
            Add(" · 装备", " · gear");
            Add("普通", "Common");
            Add("精良", "Uncommon");
            Add("稀有", "Rare");
            Add("史诗", "Epic");
            Add("传说", "Legendary");
            Add("神器", "Artifact");
            Add("材料", "Material");
            Add("部件", "Component");
            Add("食物", "Food");
            Add("医疗", "Medical");
            Add("房车设备", "RV Device");
            Add("用品", "Utility");
            Add("奢侈品", "Luxury");
            Add("药品", "Drug");
            Add("特殊工具", "Special Tool");
            Add("种子", "Seed");
            Add("动物", "Animal");
            Add("优良", "Fine");
            Add("白", "Wh");
            Add("绿", "Gr");
            Add("蓝", "Bl");
            Add("紫", "Pu");
            Add("金", "Go");
            Add("装备", "Gear");
            Add("（无装备）", "(no equipment)");
            Add("（无卡牌）", "(no cards)");
            Add("（无物品）", "(no items)");
            Add("（无匹配物品）", "(no matching items)");
            Add("（未读取存档）", "(save not loaded)");
            Add("（无匹配物品，换个关键词试试）", "(no match, try another keyword)");
            Add("🌐 Language / 语言", "🌐 Language / 语言");
            Add("结束", "End");
        }


        // 存档槽位显示名（下拉框/状态栏用；内部仍用原始 id）
        public static string SlotDisplay(string slot)
        {
            if (!En)
            {
                if (slot == "current") return "当前";
                if (slot == "manual-1") return "手动存档1";
                if (slot == "manual-2") return "手动存档2";
                if (slot == "manual-3") return "手动存档3";
                return slot;
            }
            if (slot == "current") return "Current";
            if (slot == "manual-1") return "Manual 1";
            if (slot == "manual-2") return "Manual 2";
            if (slot == "manual-3") return "Manual 3";
            return slot;
        }

        public static string LangSlotCn(string s)
        {
            if (s == "武器") return L("武器");
            if (s == "护甲") return L("护甲");
            if (s == "饰品") return L("饰品");
            return s;
        }
    }
}
