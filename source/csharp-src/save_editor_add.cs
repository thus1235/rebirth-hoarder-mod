// 存档修改器 v3.6 新增功能：添加物品 / 装备（搜索引擎式选择器，从 F8 面板 v1.13 移入）
// MainForm 的 partial 部分（C# 5 语法兼容，系统自带 csc 可编译）
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace RhSaveTrainer
{
    public partial class MainForm
    {
        TextBox _addSearch;
        ListBox _addResults;
        NumericUpDown _addQty;
        ComboBox _addTarget;
        NumericUpDown _addLevel, _addEnh, _addUpg;
        ComboBox _addRarity;
        Panel _gearPanel;
        List<ItemDef> _allDefs;
        List<ItemDef> _addShown = new List<ItemDef>();
        List<string> _recentAdds = new List<string>();
        static Random _rnd = new Random();

        public class ItemDef
        {
            public string Id, Name, Type, Rarity, Icon, Py;
            public int MaxStack, MaxDurability;
            public bool IsGear;
        }

        static string TypeCn(string t)
        {
            string zh;
            switch (t == null ? "" : t)
            {
                case "material": zh = "材料"; break;
                case "component": zh = "部件"; break;
                case "food": zh = "食物"; break;
                case "medical": zh = "医疗"; break;
                case "weapon": zh = "武器"; break;
                case "rv_device": zh = "房车设备"; break;
                case "utility": zh = "用品"; break;
                case "luxury": zh = "奢侈品"; break;
                case "armor": zh = "护甲"; break;
                case "accessory": zh = "饰品"; break;
                case "drug": zh = "药品"; break;
                case "tool_special": zh = "特殊工具"; break;
                case "seed": zh = "种子"; break;
                case "animal": zh = "动物"; break;
                default: return t == null ? "" : t;
            }
            return Lang.L(zh);
        }

        void InitItemDefs()
        {
            if (_allDefs != null) return;
            _allDefs = ParseItemTable();
        }

        static List<ItemDef> ParseItemTable()
        {
            List<ItemDef> defs = new List<ItemDef>();
            foreach (string line in ItemTable.Items.Split('\n'))
            {
                string[] f = line.Split('|');
                if (f.Length < 8) continue;
                ItemDef d = new ItemDef();
                d.Id = f[0]; d.Name = f[1]; d.Type = f[2]; d.Rarity = f[3];
                int.TryParse(f[4], out d.MaxStack);
                d.IsGear = f[5] == "1";
                int.TryParse(f[6], out d.MaxDurability);
                d.Icon = f[7];
                d.Py = f.Length > 8 ? f[8] : "";
                defs.Add(d);
            }
            return defs;
        }

        string AddRecentFile()
        {
            try { return Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "rh_recent_items.txt"); }
            catch { return null; }
        }

        void LoadRecent()
        {
            _recentAdds.Clear();
            string f = AddRecentFile();
            if (f == null || !File.Exists(f)) return;
            try
            {
                foreach (string id in File.ReadAllLines(f))
                    if (id.Trim().Length > 0 && _recentAdds.IndexOf(id.Trim()) < 0 && _recentAdds.Count < 10) _recentAdds.Add(id.Trim());
            }
            catch { }
        }

        void PushRecent(string id)
        {
            _recentAdds.Remove(id);
            _recentAdds.Insert(0, id);
            while (_recentAdds.Count > 10) _recentAdds.RemoveAt(_recentAdds.Count - 1);
            string f = AddRecentFile();
            if (f != null) { try { File.WriteAllLines(f, _recentAdds.ToArray()); } catch { } }
        }

        ItemDef FindDef(string id)
        {
            if (_allDefs == null || id == null) return null;
            foreach (ItemDef d in _allDefs) if (d.Id == id) return d;
            return null;
        }

        string AddDisplay(ItemDef d)
        {
            return (d.Icon.Length > 0 ? d.Icon + " " : "") + d.Name + "  [" + d.Id + "] · "
                + TypeCn(d.Type) + (d.IsGear ? Lang.L(" · 装备") : "");
        }

        static bool Subseq(string needle, string hay)
        {
            int i = 0;
            for (int j = 0; j < hay.Length && i < needle.Length; j++)
                if (hay[j] == needle[i]) i++;
            return i == needle.Length;
        }

        // 单 token 打分：前缀 > 拼音首字母前缀 > 包含 > 拼音包含 > ID > 类型 > 模糊子序列；-1 = 不匹配
        static int ScoreToken(ItemDef d, string t)
        {
            string name = d.Name.ToLower(), id = d.Id.ToLower(), py = d.Py == null ? "" : d.Py.ToLower();
            string type = (TypeCn(d.Type) + " " + (d.Type ?? "")).ToLower();
            if (name.StartsWith(t)) return 100;
            if (py.StartsWith(t)) return 92;
            if (name.Contains(t)) return 80;
            if (py.Contains(t)) return 70;
            if (id.Contains(t)) return 60;
            if (type.Contains(t)) return 50;
            if (Subseq(t, name) || Subseq(t, id)) return 30;
            return -1;
        }

        static int ScoreItem(ItemDef d, string[] toks)
        {
            int total = 0;
            foreach (string t in toks)
            {
                int s = ScoreToken(d, t);
                if (s < 0) return -1;
                total += s;
            }
            if (d.IsGear) total += 1; // 同分时装备优先展示
            return total;
        }

        void RefreshAddResults()
        {
            if (_addResults == null) return;
            InitItemDefs();
            _addResults.BeginUpdate();
            _addResults.Items.Clear();
            _addShown.Clear();
            string q = _addSearch.Text.Trim().ToLower();
            string[] toks = q.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            List<ItemDef> list = new List<ItemDef>();
            if (toks.Length == 0)
            {
                // 空关键词：最近添加置顶，其余按表序
                foreach (string id in _recentAdds) { ItemDef d = FindDef(id); if (d != null) list.Add(d); }
                foreach (ItemDef d in _allDefs) if (_recentAdds.IndexOf(d.Id) < 0) list.Add(d);
            }
            else
            {
                List<int> scores = new List<int>();
                foreach (ItemDef d in _allDefs)
                {
                    int s = ScoreItem(d, toks);
                    if (s >= 0) { list.Add(d); scores.Add(s); }
                }
                // 插入排序按分数降序（条目少，稳定且简单）
                for (int i = 1; i < list.Count; i++)
                {
                    ItemDef di = list[i]; int si = scores[i]; int j = i - 1;
                    while (j >= 0 && scores[j] < si) { list[j + 1] = list[j]; scores[j + 1] = scores[j]; j--; }
                    list[j + 1] = di; scores[j + 1] = si;
                }
                if (list.Count > 40) list.RemoveRange(40, list.Count - 40);
            }
            foreach (ItemDef d in list) { _addShown.Add(d); _addResults.Items.Add(AddDisplay(d)); }
            if (_addShown.Count == 0) _addResults.Items.Add("（无匹配物品，换个关键词试试）");
            _addResults.EndUpdate();
            UpdateGearPanel();
        }

        void UpdateGearPanel()
        {
            if (_gearPanel == null) return;
            bool gear = _addResults.SelectedIndex >= 0 && _addResults.SelectedIndex < _addShown.Count
                && _addShown[_addResults.SelectedIndex].IsGear;
            _gearPanel.Enabled = gear;
            _addQty.Enabled = !gear;
            _addTarget.Enabled = !gear;
        }

        TabPage BuildAddTab()
        {
            InitItemDefs();
            LoadRecent();

            TabPage page = new TabPage("添加物品");
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.Padding = new Padding(8);
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 250));

            // 左列：搜索框 + 结果列表
            Panel left = new Panel();
            left.Dock = DockStyle.Fill;

            _addSearch = new TextBox();
            _addSearch.Dock = DockStyle.Top;
            _addSearch.Font = new Font("Microsoft YaHei UI", 11f);
            _addSearch.TextChanged += delegate(object s, EventArgs e) { RefreshAddResults(); };
            _addSearch.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    if (_addResults.Items.Count > 0) { _addResults.SelectedIndex = 0; AddToSave(); }
                }
            };
            left.Controls.Add(_addSearch);

            _addResults = new ListBox();
            _addResults.Dock = DockStyle.Fill;
            _addResults.Font = new Font("Microsoft YaHei UI", 10f);
            _addResults.IntegralHeight = false;
            _addResults.SelectedIndexChanged += delegate(object s, EventArgs e) { UpdateGearPanel(); };
            _addResults.DoubleClick += delegate(object s, EventArgs e) { AddToSave(); };
            left.Controls.Add(_addResults);
            left.Controls.SetChildIndex(_addSearch, 0);
            layout.Controls.Add(left, 0, 0);

            // 右列：参数面板
            Panel right = new Panel();
            right.Dock = DockStyle.Fill;
            int y = 4;

            Label tip = new Label();
            tip.Text = "🔍 像搜索引擎一样找物品：\n支持中文 / ID / 拼音首字母（如 zdylb=战地医疗包）/ 模糊输入 / 空格分多词。\n双击条目直接加入；回车加入第一个结果。";
            tip.Location = new Point(4, y);
            tip.Size = new Size(240, 100);
            tip.ForeColor = Color.FromArgb(110, 110, 110);
            right.Controls.Add(tip);
            y += 104;

            right.Controls.Add(MakeLabel("数量:", 4, y)); y += 24;
            _addQty = new NumericUpDown();
            _addQty.Location = new Point(4, y);
            _addQty.Width = 120;
            _addQty.Minimum = 1; _addQty.Maximum = 999999999; _addQty.Value = 1;
            right.Controls.Add(_addQty); y += 32;

            right.Controls.Add(MakeLabel("加入:", 4, y)); y += 24;
            _addTarget = new ComboBox();
            _addTarget.Location = new Point(4, y);
            _addTarget.Width = 120;
            _addTarget.DropDownStyle = ComboBoxStyle.DropDownList;
            _addTarget.Items.Add("背包"); _addTarget.Items.Add("仓库");
            _addTarget.SelectedIndex = 0;
            right.Controls.Add(_addTarget); y += 34;

            // 装备参数区（仅选中武器/护甲/饰品时可用）
            _gearPanel = new Panel();
            _gearPanel.Location = new Point(4, y);
            _gearPanel.Size = new Size(240, 220);
            _gearPanel.Enabled = false;
            int gy = 0;

            Label gl = new Label();
            gl.Text = "⚔️ 装备参数（选中武器/护甲/饰品\n时生效，固定加入背包）";
            gl.Location = new Point(0, gy);
            gl.Size = new Size(240, 32);
            gl.ForeColor = Color.FromArgb(140, 90, 20);
            _gearPanel.Controls.Add(gl); gy += 34;

            _gearPanel.Controls.Add(MakeLabel("等级(1~99):", 0, gy)); gy += 22;
            _addLevel = new NumericUpDown();
            _addLevel.Location = new Point(0, gy); _addLevel.Width = 90;
            _addLevel.Minimum = 1; _addLevel.Maximum = 99;
            _gearPanel.Controls.Add(_addLevel); gy += 28;

            _gearPanel.Controls.Add(MakeLabel("强化(0~10):", 0, gy)); gy += 22;
            _addEnh = new NumericUpDown();
            _addEnh.Location = new Point(0, gy); _addEnh.Width = 90;
            _addEnh.Minimum = 0; _addEnh.Maximum = 10;
            _gearPanel.Controls.Add(_addEnh); gy += 28;

            _gearPanel.Controls.Add(MakeLabel("改造(0~30):", 0, gy)); gy += 22;
            _addUpg = new NumericUpDown();
            _addUpg.Location = new Point(0, gy); _addUpg.Width = 90;
            _addUpg.Minimum = 0; _addUpg.Maximum = 30;
            _gearPanel.Controls.Add(_addUpg); gy += 28;

            _gearPanel.Controls.Add(MakeLabel("稀有度:", 0, gy)); gy += 22;
            _addRarity = new ComboBox();
            _addRarity.Location = new Point(0, gy); _addRarity.Width = 150;
            _addRarity.DropDownStyle = ComboBoxStyle.DropDownList;
            _addRarity.Items.Add("默认（按物品定义）");
            _addRarity.Items.Add("普通 common");
            _addRarity.Items.Add("精良 uncommon");
            _addRarity.Items.Add("稀有 rare");
            _addRarity.Items.Add("史诗 epic");
            _addRarity.Items.Add("传说 legendary");
            _addRarity.Items.Add("神器 artifact");
            _addRarity.SelectedIndex = 0;
            _gearPanel.Controls.Add(_addRarity);

            right.Controls.Add(_gearPanel);
            y += 226;

            Button addBtn = new Button();
            addBtn.Text = "➕ 添加到存档";
            addBtn.Location = new Point(4, y);
            addBtn.Width = 180;
            addBtn.Height = 34;
            addBtn.Font = new Font("Microsoft YaHei UI", 10f, FontStyle.Bold);
            addBtn.Click += delegate(object s, EventArgs e) { AddToSave(); };
            right.Controls.Add(addBtn);
            y += 42;

            Button delBtn = new Button();
            delBtn.Text = "🗑 删除「物品」页选中物品";
            delBtn.Location = new Point(4, y);
            delBtn.Width = 180;
            delBtn.Click += delegate(object s, EventArgs e) { DeleteSelectedInv(); };
            right.Controls.Add(delBtn);

            layout.Controls.Add(right, 1, 0);
            page.Controls.Add(layout);
            _tabs.SelectedIndexChanged += delegate(object s, EventArgs e)
            {
                if (_tabs.SelectedTab != null && _tabs.SelectedTab.Text == "添加物品") { RefreshAddResults(); _addSearch.Focus(); }
            };
            RefreshAddResults();
            return page;
        }

        Label MakeLabel(string text, int x, int y)
        {
            Label l = new Label();
            l.Text = text;
            l.Location = new Point(x, y);
            l.AutoSize = true;
            return l;
        }

        void AddToSave()
        {
            if (_payload == null) { Msg("请先读取存档再添加物品。", "提示", MessageBoxIcon.Information); return; }
            int sel = _addResults.SelectedIndex;
            if (sel < 0 || sel >= _addShown.Count) { SetStatus("请先在列表里选中一个物品（或双击直接加入）"); return; }
            ItemDef d = _addShown[sel];
            bool stash = _addTarget.SelectedIndex == 1 && !d.IsGear;
            List<object> inv = GetItemList(stash);
            if (inv == null) { Msg("当前存档没有第二阶段（房车局内）的游戏状态，无法添加物品。\n请先在游戏里开局进入房车阶段并存档。", "提示", MessageBoxIcon.Information); return; }
            string iid = "rhedit_" + DateTime.Now.Ticks + "_" + _rnd.Next(100000);
            try
            {
                if (d.IsGear)
                {
                    inv.Add(BuildGearDict(d, iid));
                }
                else
                {
                    double qty = (double)_addQty.Value;
                    bool merged = false;
                    for (int i = 0; i < inv.Count; i++)
                    {
                        Dictionary<string, object> it = inv[i] as Dictionary<string, object>;
                        if (it == null) continue;
                        object dv;
                        string exId = it.TryGetValue("defId", out dv) ? Convert.ToString(dv) : "";
                        if (exId == d.Id && !IsEquipment(it))
                        {
                            object qv;
                            double ex = it.TryGetValue("quantity", out qv) && qv is double ? (double)qv : 1;
                            it["quantity"] = ex + qty;
                            merged = true;
                            break;
                        }
                    }
                    if (!merged)
                    {
                        Dictionary<string, object> it = new Dictionary<string, object>();
                        it["instanceId"] = iid;
                        it["defId"] = d.Id;
                        it["x"] = -1d; it["y"] = -1d; it["rotation"] = 0d;
                        it["quantity"] = qty;
                        inv.Add(it);
                    }
                }
            }
            catch (Exception ex) { Msg("添加失败:\n" + ex.Message, "错误", MessageBoxIcon.Error); return; }
            PushRecent(d.Id);
            RepopulateInv();
            MarkDirty();
            SetStatus("已添加 " + d.Name + (d.IsGear ? "（装备，背包）" : " ×" + _addQty.Value + (stash ? "（仓库）" : "（背包）")) + "，记得点“写入修改”");
            LogWrite("AddItem: " + d.Id + (d.IsGear ? " gear" : " x" + _addQty.Value) + (stash ? " stash" : " inv"));
        }

        Dictionary<string, object> BuildGearDict(ItemDef d, string iid)
        {
            double level = (double)_addLevel.Value;
            double enh = (double)_addEnh.Value;
            double upg = (double)_addUpg.Value;
            string rarity;
            switch (_addRarity.SelectedIndex)
            {
                case 1: rarity = "common"; break;
                case 2: rarity = "uncommon"; break;
                case 3: rarity = "rare"; break;
                case 4: rarity = "epic"; break;
                case 5: rarity = "legendary"; break;
                case 6: rarity = "artifact"; break;
                default: rarity = d.Rarity != null && d.Rarity.Length > 0 ? d.Rarity : "epic"; break;
            }
            double bonus = rarity == "artifact" ? 0.6 : rarity == "legendary" ? 0.4 : rarity == "epic" ? 0.2 : 0;
            double scale = 0.8 + level * 0.02 + enh * 0.04 + upg * 0.02 + bonus;
            if (scale < 0.5) scale = 0.5;
            if (scale > 3) scale = 3;
            Dictionary<string, object> g = new Dictionary<string, object>();
            g["instanceId"] = iid;
            g["defId"] = d.Id;
            g["quantity"] = 1d;
            g["x"] = -1d; g["y"] = -1d; g["rotation"] = 0d;
            g["rarity"] = rarity;
            g["level"] = level;
            g["enhanceLevel"] = enh;
            g["upgradeLevel"] = upg;
            g["qualityTier"] = "mid";
            g["affixes"] = new List<object>();
            g["affixName"] = d.Name;
            g["statScale"] = scale;
            g["durability"] = d.MaxDurability > 0 ? (double)d.MaxDurability : 9999d;
            g["locked"] = false;
            g["selfRepair"] = false;
            if (rarity == "artifact") g["artifactSourceBaseId"] = d.Id;
            return g;
        }

        void DeleteSelectedInv()
        {
            if (_payload == null) { Msg("请先读取存档。", "提示", MessageBoxIcon.Information); return; }
            int sel = _invList.SelectedIndex;
            if (sel < 0 || sel >= _invItems.Count) { SetStatus("请先在「物品」页选中要删除的物品"); return; }
            List<object> inv = GetItemList(_invItems[sel].IsStash);
            int ri = _invItems[sel].Index;
            if (inv == null || ri < 0 || ri >= inv.Count) { SetStatus("物品索引异常，请重新读取存档"); return; }
            string defId = _invItems[sel].DefId;
            inv.RemoveAt(ri);
            RepopulateInv();
            MarkDirty();
            SetStatus("已删除 " + ItemDisplayName(defId) + "，记得点“写入修改”");
            LogWrite("DeleteItem: " + defId);
        }

        // ============ 离线自检（test_main.cs 的 items 模式调用，不依赖 GUI） ============
        public static int ItemsSelfTest()
        {
            int fails = 0;
            List<ItemDef> defs = ParseItemTable();
            Action<bool, string> check = delegate(bool ok, string name)
            {
                Console.WriteLine((ok ? "  [通过] " : "  [失败] ") + name);
                if (!ok) fails++;
            };
            check(defs.Count >= 150, "物品表解析条数>=150（实际 " + defs.Count + "）");
            ItemDef medkit = defs.Find(x => x.Id == "medkit");
            check(medkit != null && medkit.Name == "战地医疗包", "medkit 中文名正确");
            check(medkit != null && medkit.Py == "zdylb", "medkit 拼音首字母 zdylb");
            check(defs.Exists(x => x.Id == "gatling_gun" && x.IsGear), "加特林标记为装备");
            check(defs.Exists(x => x.Id == "water_bottle" && !x.IsGear && x.MaxStack == 20), "纯净水非装备、堆叠20");
            ItemDef knife = defs.Find(x => x.Id == "knife");
            check(knife != null && knife.MaxDurability > 0, "战术匕首带耐久");

            // 搜索打分：多关键词 + 拼音 + 模糊
            ItemDef[] all = defs.ToArray();
            ItemDef top = null, top2 = null;
            int best = -1, best2 = -1;
            foreach (ItemDef d in all)
            {
                int s = ScoreItem(d, new string[] { "zdylb" });
                if (s > best) { best2 = best; top2 = top; best = s; top = d; }
                else if (s > best2) { best2 = s; top2 = d; }
            }
            check(top == medkit, "搜 zdylb 首位=战地医疗包");
            top = null; best = -1;
            foreach (ItemDef d in all)
            {
                int s = ScoreItem(d, new string[] { "种子" });
                if (s > best) { best = s; top = d; }
            }
            check(top != null && top.Type == "seed", "搜「种子」命中 seed 类物品");
            int seedCnt = 0;
            foreach (ItemDef d in all) if (ScoreItem(d, new string[] { "seed" }) > 0) seedCnt++;
            check(seedCnt >= 10, "搜 seed/拼音命中全部种子（" + seedCnt + "）");
            top = null; best = -1;
            foreach (ItemDef d in all)
            {
                int s = ScoreItem(d, new string[] { "加特", "机枪" });
                if (s > best) { best = s; top = d; }
            }
            check(top != null && top.Id == "gatling_gun", "多关键词「加特 机枪」命中加特林");
            ItemDef fuzzy = defs.Find(x => x.Id == "ammo_box");
            check(ScoreItem(fuzzy, new string[] { "弹箱" }) > 0, "模糊子序列「弹箱」命中弹药箱");
            check(ScoreItem(medkit, new string[] { "不存在词" }) < 0, "无关词不命中");
            Console.WriteLine(fails == 0 ? "ItemsSelfTest: ALL PASS" : "ItemsSelfTest: " + fails + " FAILED");
            return fails;
        }
    }
}
