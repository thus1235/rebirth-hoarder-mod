// 存档修改器 v3.0 新增功能：角色等级/属性点、装备、卡牌、命途、医疗舱
// MainForm 的 partial 部分（C# 5 语法兼容）
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace RhSaveTrainer
{
    public partial class MainForm
    {
        bool _loading;

        // 标记有未保存修改（写入按钮高亮提示）
        void MarkDirty()
        {
            if (_loading) return;
            _dirty = true;
            if (_saveBtn != null)
            {
                _saveBtn.Text = "写入修改 ●";
                _saveBtn.BackColor = Color.FromArgb(255, 244, 200);
            }
        }

        void MarkClean()
        {
            _dirty = false;
            if (_saveBtn != null)
            {
                _saveBtn.Text = "写入修改";
                _saveBtn.BackColor = C_GREEN;
                _saveBtn.FlatAppearance.MouseOverBackColor = C_GREEN_HOVER;
            }
        }

        // 操作日志（诊断用，位于 exe 同目录 rh_editor.log）
        // 策略：所有日志先进内存缓冲；只有出现“错误/失败/阻止/异常”级事件时，
        // 程序退出才把缓冲写入 rh_editor.log；正常操作不写文件，退出时删除残留。
        static readonly List<string> _logBuf = new List<string>();
        static bool _logDirty;   // 本次会话是否出现需记录的异常

        static void LogWrite(string msg)
        {
            try
            {
                lock (_logBuf)
                {
                    _logBuf.Add(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " | " + msg);
                    // 含错误/失败/阻止/异常 关键字的记录视为需要落盘
                    if (msg.IndexOf("失败") >= 0 || msg.IndexOf("错误") >= 0 ||
                        msg.IndexOf("阻止") >= 0 || msg.IndexOf("异常") >= 0 ||
                        msg.IndexOf("警告") >= 0)
                        _logDirty = true;
                }
            }
            catch { }
        }

        // 强制标记本会话有错误（显式错误级日志；用于 msg 不含关键字但确属异常的场景）
        static void LogWriteErr(string msg)
        {
            try { _logDirty = true; } catch { }
            LogWrite(msg);
        }

        // 退出时调用：有异常则写 rh_editor.log，否则删除残留，保持目录干净。
        static void FlushLog()
        {
            try
            {
                string dir = Path.GetDirectoryName(Application.ExecutablePath);
                string log = Path.Combine(dir, "rh_editor.log");
                if (_logDirty)
                {
                    lock (_logBuf)
                    {
                        File.WriteAllLines(log, _logBuf, new UTF8Encoding(false));
                    }
                }
                else
                {
                    if (File.Exists(log)) File.Delete(log);
                }
            }
            catch { }
        }

        // ============ UI 主题（现代浅色扁平风） ============
        static readonly Color C_BG = Color.FromArgb(244, 246, 250);
        static readonly Color C_ACCENT = Color.FromArgb(59, 130, 246);
        static readonly Color C_ACCENT_HOVER = Color.FromArgb(37, 99, 235);
        static readonly Color C_ACCENT_DOWN = Color.FromArgb(29, 78, 216);
        static readonly Color C_GREEN = Color.FromArgb(16, 185, 129);
        static readonly Color C_GREEN_HOVER = Color.FromArgb(5, 150, 105);
        static readonly Color C_TEXT = Color.FromArgb(30, 41, 59);
        static readonly Color C_BORDER = Color.FromArgb(226, 232, 240);
        static readonly Color C_TAB_INACTIVE = Color.FromArgb(226, 232, 240);

        void ApplyTheme()
        {
            BackColor = C_BG;
            Font = new Font("Microsoft YaHei UI", 9.5f);
            ApplyThemeTo(this);
            // TabControl 自定义绘制
            _tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
            _tabs.ItemSize = new Size(94, 30);
            _tabs.SizeMode = TabSizeMode.Fixed;
            _tabs.DrawItem += delegate(object s, DrawItemEventArgs e)
            {
                TabPage tp = _tabs.TabPages[e.Index];
                Rectangle r = e.Bounds;
                bool selected = e.Index == _tabs.SelectedIndex;
                bool live = (tp.Tag as string) == "live";
                Color accent = live ? C_GREEN : C_ACCENT;
                using (SolidBrush bg = new SolidBrush(selected ? accent : C_TAB_INACTIVE))
                    e.Graphics.FillRectangle(bg, r);
                // 圆点：绿=局内可改，红=局外可改
                using (SolidBrush dot = new SolidBrush(live ? C_GREEN : Color.FromArgb(220, 60, 60)))
                    e.Graphics.FillEllipse(dot, r.X + 5, r.Y + (r.Height - 7) / 2, 7, 7);
                Rectangle tr = new Rectangle(r.X + 14, r.Y, r.Width - 16, r.Height);
                TextRenderer.DrawText(e.Graphics, tp.Text,
                    new Font("Microsoft YaHei UI", 9f, selected ? FontStyle.Bold : FontStyle.Regular),
                    tr, selected ? Color.White : C_TEXT,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            };
            if (_saveBtn != null)
            {
                _saveBtn.BackColor = C_GREEN;
                _saveBtn.FlatAppearance.MouseOverBackColor = C_GREEN_HOVER;
                _saveBtn.FlatAppearance.MouseDownBackColor = C_GREEN_HOVER;
            }
        }

        void ApplyThemeTo(Control c)
        {
            foreach (Control ch in c.Controls) ApplyThemeTo(ch);
            if (c is Button)
            {
                Button b = (Button)c;
                b.FlatStyle = FlatStyle.Flat;
                b.FlatAppearance.BorderSize = 0;
                b.BackColor = C_ACCENT;
                b.ForeColor = Color.White;
                b.FlatAppearance.MouseOverBackColor = C_ACCENT_HOVER;
                b.FlatAppearance.MouseDownBackColor = C_ACCENT_DOWN;
                b.Cursor = Cursors.Hand;
                b.Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
                return;
            }
            if (c is TextBox)
            {
                TextBox t = (TextBox)c;
                t.BackColor = Color.White;
                t.ForeColor = C_TEXT;
                t.BorderStyle = BorderStyle.FixedSingle;
            }
            else if (c is ComboBox) { c.BackColor = Color.White; c.ForeColor = C_TEXT; }
            else if (c is ListBox)
            {
                ListBox l = (ListBox)c;
                l.BackColor = Color.White;
                l.ForeColor = C_TEXT;
                l.BorderStyle = BorderStyle.FixedSingle;
            }
            else if (c is NumericUpDown) { c.BackColor = Color.White; c.ForeColor = C_TEXT; }
            else if (c is CheckBox) { c.ForeColor = C_TEXT; }
            else if (c is Label)
            {
                Label l = (Label)c;
                if (l.ForeColor == SystemColors.ControlText) l.ForeColor = C_TEXT;
            }
            else if (c is GroupBox)
            {
                c.BackColor = Color.White;
                c.ForeColor = C_ACCENT;
            }
            else if (c is TabPage) { c.BackColor = C_BG; }
            else if (c is Panel || c is TableLayoutPanel) { c.BackColor = Color.White; }
            else if (c is DataGridView)
            {
                DataGridView g = (DataGridView)c;
                g.EnableHeadersVisualStyles = false;
                g.ColumnHeadersDefaultCellStyle.BackColor = C_ACCENT;
                g.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
                g.ColumnHeadersDefaultCellStyle.Font = new Font("Microsoft YaHei UI", 9f, FontStyle.Bold);
                g.ColumnHeadersHeight = 26;
                g.BorderStyle = BorderStyle.FixedSingle;
                g.GridColor = C_BORDER;
                g.BackgroundColor = Color.White;
                g.DefaultCellStyle.Font = new Font("Microsoft YaHei UI", 9f);
            }
        }
        // ---- 角色属性 / 医疗舱 条目 ----
        Dictionary<string, TextBox> _charEntries = new Dictionary<string, TextBox>();
        Dictionary<string, TextBox> _medEntries = new Dictionary<string, TextBox>();
        Label _charTip;

        // ---- 装备 ----
        ListBox _equipList;
        List<int> _equipIndexes = new List<int>();
        Label _equipSlotLabel;
        TextBox _equipLevel, _equipEnhance, _equipUpgrade, _equipDurability, _equipRarity, _equipQuality;
        CheckBox _equipLocked;
        DataGridView _equipAffixes;
        CheckBox _equipForgeAll;

        // ---- 卡牌 ----
        ListBox _cardList;
        List<string> _cardIds = new List<string>();
        NumericUpDown _cardWhite, _cardGreen, _cardBlue, _cardPurple, _cardGold;

        // ---- 命途 ----
        TextBox _routeText, _routePending, _routeMilestone;
        DataGridView _routeSkills;
        Label _routeNameLabel;

        // ---- 装备词缀名 ----
        Label _equipAffixNameLabel;

        // ---- 中文名映射 ----
        static Dictionary<string, string> _names;
        static Dictionary<string, string> _routeNames;
        static Dictionary<string, string> _skillNames;
        static Dictionary<string, string> _rarityNames;
        static Dictionary<string, string> _tierNames;
        static HashSet<string> _dupNames;

        static void InitNames()
        {
            _names = new Dictionary<string, string>();
            AddTable(_names, GameNames.Table);
            _routeNames = new Dictionary<string, string>();
            AddTable(_routeNames, GameNames.Routes);
            _skillNames = new Dictionary<string, string>();
            AddTable(_skillNames, GameNames.Skills);
            _rarityNames = new Dictionary<string, string>();
            _rarityNames["common"] = "普通";
            _rarityNames["fine"] = "优良";
            _rarityNames["rare"] = "稀有";
            _rarityNames["epic"] = "史诗";
            _rarityNames["legendary"] = "传说";
            _rarityNames["artifact"] = "神器";
            _tierNames = new Dictionary<string, string>();
            _tierNames["low"] = "欠佳品相";
            _tierNames["mid"] = "良好品相";
            _tierNames["high"] = "上乘品相";
            _dupNames = new HashSet<string>();
            Dictionary<string, int> counts = new Dictionary<string, int>();
            foreach (KeyValuePair<string, string> kv in _names)
            {
                int c;
                counts.TryGetValue(kv.Value, out c);
                counts[kv.Value] = c + 1;
            }
            foreach (KeyValuePair<string, int> kv in counts)
                if (kv.Value > 1) _dupNames.Add(kv.Key);
        }

        static void AddTable(Dictionary<string, string> d, string table)
        {
            foreach (string line in table.Split('\n'))
            {
                int eq = line.IndexOf('=');
                if (eq > 0) d[line.Substring(0, eq)] = line.Substring(eq + 1);
            }
        }

        // 物品/卡牌中文名（重名时附加 defId 消歧，未知 id 原样显示）
        public static string ItemDisplayName(string id)
        {
            if (_names == null) InitNames();
            string n;
            if (id != null && _names.TryGetValue(id, out n))
                return _dupNames.Contains(n) ? n + "(" + id + ")" : n;
            return id != null ? id : "?";
        }

        public static string RarityName(string r)
        {
            if (_rarityNames == null) InitNames();
            string n;
            if (r != null && _rarityNames.TryGetValue(r, out n)) return n;
            return r != null ? r : "";
        }

        public static string RouteDisplay(string id)
        {
            if (_routeNames == null) InitNames();
            string n;
            if (id != null && _routeNames.TryGetValue(id, out n)) return n;
            return id != null ? id : "";
        }

        public static string SkillDisplay(string id)
        {
            if (_skillNames == null) InitNames();
            string n;
            if (id != null && _skillNames.TryGetValue(id, out n)) return n;
            return id != null ? id : "";
        }

        // ============ 标签页构建 ============
        // 页内提示条（局内/局外说明）
        Label MakeNote(string text, bool live)
        {
            Label l = new Label();
            l.Text = text;
            l.Dock = DockStyle.Top;
            l.Height = 26;
            l.TextAlign = ContentAlignment.MiddleLeft;
            l.Padding = new Padding(8, 0, 0, 0);
            l.Font = new Font("Microsoft YaHei UI", 9f, FontStyle.Bold);
            l.ForeColor = live ? C_GREEN : Color.FromArgb(200, 60, 60);
            l.BackColor = Color.FromArgb(255, 255, 255);
            return l;
        }

        TabPage BuildCharTab()
        {
            TabPage page = new TabPage("角色属性");
            GroupBox f = new GroupBox();
            f.Text = "人物等级 / 属性点　🔒 局外可改（需关闭游戏）";
            f.Dock = DockStyle.Fill;
            Label tip = new Label();
            tip.Text = "属性点上限：读取存档后显示。";
            tip.Dock = DockStyle.Top;
            tip.AutoSize = true;
            tip.MaximumSize = new Size(860, 0);
            tip.Padding = new Padding(10, 4, 10, 2);
            tip.ForeColor = Color.FromArgb(150, 100, 40);
            tip.BackColor = Color.White;
            _charTip = tip;
            TableLayoutPanel tbl = new TableLayoutPanel();
            tbl.Dock = DockStyle.Top;
            tbl.AutoSize = true;
            tbl.ColumnCount = 2;
            tbl.Padding = new Padding(10);
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddField(tbl, _charEntries, "玩家等级 playerLevel");
            AddField(tbl, _charEntries, "经验 playerExp");
            AddField(tbl, _charEntries, "自由属性点 freeAttributePoints");
            AddField(tbl, _charEntries, "力量 primaryAttributes.strength");
            AddField(tbl, _charEntries, "敏捷 primaryAttributes.agility");
            AddField(tbl, _charEntries, "体质 primaryAttributes.constitution");
            AddField(tbl, _charEntries, "感知 primaryAttributes.perception");
            foreach (KeyValuePair<string, TextBox> kv in _charEntries)
                kv.Value.TextChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            f.Controls.Add(tbl);
            f.Controls.Add(tip);
            page.Controls.Add(f);
            return page;
        }

        TabPage BuildMedTab()
        {
            TabPage page = new TabPage("医疗舱");
            GroupBox f = new GroupBox();
            f.Text = "医疗舱　🔒 局外可改（需关闭游戏）";
            f.Dock = DockStyle.Fill;
            TableLayoutPanel tbl = new TableLayoutPanel();
            tbl.Dock = DockStyle.Top;
            tbl.AutoSize = true;
            tbl.ColumnCount = 2;
            tbl.Padding = new Padding(10);
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddField(tbl, _medEntries, "觉醒阶段 awakeningStage");
            AddField(tbl, _medEntries, "觉醒经验倍率 awakeningExpMultiplier");
            AddField(tbl, _medEntries, "克隆年龄 cloneAge");
            AddField(tbl, _medEntries, "端粒过载债务 telomereOverloadDebt");
            foreach (KeyValuePair<string, TextBox> kv in _medEntries)
                kv.Value.TextChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            f.Controls.Add(tbl);
            page.Controls.Add(f);
            return page;
        }

        TabPage BuildEquipTab()
        {
            TabPage page = new TabPage("装备");
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.Padding = new Padding(8);
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 330));

            _equipList = new ListBox();
            _equipList.Dock = DockStyle.Fill;
            _equipList.Font = new Font("Microsoft YaHei UI", 9f);
            _equipList.SelectedIndexChanged += delegate(object s, EventArgs e) { OnEquipSelect(); };
            layout.Controls.Add(_equipList, 0, 0);

            TableLayoutPanel right = new TableLayoutPanel();
            right.Dock = DockStyle.Fill;
            right.ColumnCount = 2;
            right.Padding = new Padding(6);
            right.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
            right.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int r = 0; r <= 12; r++) right.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));   // 词缀表格占满剩余，滚动条在最底，下方无控件

            _equipSlotLabel = new Label();
            _equipSlotLabel.Text = "槽位：-";
            _equipSlotLabel.AutoSize = true;
            _equipSlotLabel.ForeColor = Color.FromArgb(60, 100, 180);
            _equipSlotLabel.Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
            _equipSlotLabel.Margin = new Padding(2, 4, 2, 2);
            right.Controls.Add(_equipSlotLabel, 0, 0);
            right.SetColumnSpan(_equipSlotLabel, 2);

            _equipAffixNameLabel = new Label();
            _equipAffixNameLabel.Text = "词缀名：-";
            _equipAffixNameLabel.AutoSize = true;
            _equipAffixNameLabel.ForeColor = Color.FromArgb(150, 100, 40);
            _equipAffixNameLabel.Margin = new Padding(2, 0, 2, 4);
            right.Controls.Add(_equipAffixNameLabel, 0, 1);
            right.SetColumnSpan(_equipAffixNameLabel, 2);

            AddFieldRow(right, 2, "等级 level", out _equipLevel);
            AddFieldRow(right, 3, "强化 enhanceLevel", out _equipEnhance);
            AddFieldRow(right, 4, "升级 upgradeLevel", out _equipUpgrade);
            AddFieldRow(right, 5, "耐久 durability", out _equipDurability);
            AddFieldRow(right, 6, "稀有度 rarity", out _equipRarity);
            AddFieldRow(right, 7, "品质 qualityTier", out _equipQuality);

            _equipLocked = new CheckBox();
            _equipLocked.Text = "锁定（不可分解/出售）";
            _equipLocked.AutoSize = true;
            _equipLocked.Margin = new Padding(2, 4, 2, 2);
            _equipLocked.CheckedChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            right.Controls.Add(_equipLocked, 0, 8);
            right.SetColumnSpan(_equipLocked, 2);

            Label al = new Label();
            al.Text = "词缀（左侧ID只读，右侧数值可改）：";
            al.AutoSize = true;
            al.ForeColor = Color.FromArgb(100, 100, 100);
            al.Margin = new Padding(2, 4, 2, 2);
            right.Controls.Add(al, 0, 9);
            right.SetColumnSpan(al, 2);

            Button apply = new Button();
            apply.Text = "应用到选中装备";
            apply.AutoSize = true;
            apply.Margin = new Padding(2, 4, 2, 2);
            apply.Click += delegate(object s, EventArgs e) { ApplyEquipToPayload(); };
            right.Controls.Add(apply, 0, 10);
            right.SetColumnSpan(apply, 2);

            Label fl = new Label();
            fl.Text = "神器锻造（局外可改）：解锁后可在游戏内装备工坊把对应金装锻造成神器。";
            fl.AutoSize = true;
            fl.ForeColor = Color.FromArgb(100, 100, 100);
            fl.Margin = new Padding(2, 4, 2, 0);
            right.Controls.Add(fl, 0, 11);
            right.SetColumnSpan(fl, 2);

            _equipForgeAll = new CheckBox();
            _equipForgeAll.Text = "🔓 解锁全部 9 件神器锻造（写入时自动达标）";
            _equipForgeAll.AutoSize = true;
            _equipForgeAll.Margin = new Padding(2, 2, 2, 2);
            _equipForgeAll.CheckedChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            right.Controls.Add(_equipForgeAll, 0, 12);
            right.SetColumnSpan(_equipForgeAll, 2);

            _equipAffixes = MakeDGV();
            _equipAffixes.Height = 120;
            _equipAffixes.Dock = DockStyle.Fill;
            _equipAffixes.ScrollBars = ScrollBars.Vertical;
            _equipAffixes.Margin = new Padding(2, 4, 2, 2);
            DataGridViewTextBoxColumn ca = new DataGridViewTextBoxColumn();
            ca.Name = "affixId"; ca.HeaderText = "词缀ID"; ca.Width = 170; ca.ReadOnly = true;
            _equipAffixes.Columns.Add(ca);
            DataGridViewTextBoxColumn cv = new DataGridViewTextBoxColumn();
            cv.Name = "value"; cv.HeaderText = "数值"; cv.Width = 90;
            _equipAffixes.Columns.Add(cv);
            _equipAffixes.CellValueChanged += delegate(object s, DataGridViewCellEventArgs e) { MarkDirty(); };
            right.Controls.Add(_equipAffixes, 0, 13);
            right.SetColumnSpan(_equipAffixes, 2);

            layout.Controls.Add(right, 1, 0);

            page.Controls.Add(layout);
            page.Controls.Add(MakeNote("🔒 局外可改：需关闭游戏修改后生效（游戏自动保存会覆盖运行中的修改）", false));
            return page;
        }

        TabPage BuildCardTab()
        {
            TabPage page = new TabPage("卡牌");
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.Padding = new Padding(8);
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220));

            _cardList = new ListBox();
            _cardList.Dock = DockStyle.Fill;
            _cardList.Font = new Font("Microsoft YaHei UI", 9f);
            _cardList.SelectedIndexChanged += delegate(object s, EventArgs e) { OnCardSelect(); };
            layout.Controls.Add(_cardList, 0, 0);

            TableLayoutPanel right = new TableLayoutPanel();
            right.Dock = DockStyle.Fill;
            right.ColumnCount = 2;
            right.Padding = new Padding(6);
            right.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
            right.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int r = 0; r <= 7; r++) right.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            AddSpinRow(right, 0, "白色 white", out _cardWhite);
            AddSpinRow(right, 1, "绿色 green", out _cardGreen);
            AddSpinRow(right, 2, "蓝色 blue", out _cardBlue);
            AddSpinRow(right, 3, "紫色 purple", out _cardPurple);
            AddSpinRow(right, 4, "金色 gold", out _cardGold);
            _cardWhite.ValueChanged += delegate(object s, EventArgs e) { OnCardSpin(); };
            _cardGreen.ValueChanged += delegate(object s, EventArgs e) { OnCardSpin(); };
            _cardBlue.ValueChanged += delegate(object s, EventArgs e) { OnCardSpin(); };
            _cardPurple.ValueChanged += delegate(object s, EventArgs e) { OnCardSpin(); };
            _cardGold.ValueChanged += delegate(object s, EventArgs e) { OnCardSpin(); };

            Button apply = new Button();
            apply.Text = "应用到选中卡牌";
            apply.AutoSize = true;
            apply.Margin = new Padding(2, 10, 2, 2);
            apply.Click += delegate(object s, EventArgs e) { ApplyCardToPayload(); };
            right.Controls.Add(apply, 0, 5);
            right.SetColumnSpan(apply, 2);

            Button all99 = new Button();
            all99.Text = "全部卡牌各稀有度=99";
            all99.AutoSize = true;
            all99.Margin = new Padding(2, 6, 2, 2);
            all99.Click += delegate(object s, EventArgs e) { FillAllCards(99); };
            right.Controls.Add(all99, 0, 6);
            right.SetColumnSpan(all99, 2);

            Button allGold = new Button();
            allGold.Text = "全部卡牌金色=99";
            allGold.AutoSize = true;
            allGold.Margin = new Padding(2, 6, 2, 2);
            allGold.Click += delegate(object s, EventArgs e) { FillGoldCards(99); };
            right.Controls.Add(allGold, 0, 7);
            right.SetColumnSpan(allGold, 2);

            layout.Controls.Add(right, 1, 0);

            page.Controls.Add(layout);
            page.Controls.Add(MakeNote("⚡ 局内可改：游戏运行中写入后自动重载生效", true));
            return page;
        }

        TabPage BuildRouteTab()
        {
            TabPage page = new TabPage("命途");
            GroupBox f = new GroupBox();
            f.Text = "命途　🔒 局外可改（需关闭游戏）";
            f.Dock = DockStyle.Fill;
            TableLayoutPanel tbl = new TableLayoutPanel();
            tbl.Dock = DockStyle.Top;
            tbl.AutoSize = true;
            tbl.ColumnCount = 2;
            tbl.Padding = new Padding(10);
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddField(tbl, null, "路线 selectedRoute", out _routeText);
            _routeText.TextChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            _routeNameLabel = new Label();
            _routeNameLabel.Text = "（中文名）";
            _routeNameLabel.AutoSize = true;
            _routeNameLabel.ForeColor = Color.FromArgb(60, 100, 180);
            _routeNameLabel.Margin = new Padding(6, 4, 6, 2);
            tbl.RowCount++;
            tbl.Controls.Add(_routeNameLabel, 1, tbl.RowCount - 1);
            AddField(tbl, null, "待分配点数 pendingChoices", out _routePending);
            _routePending.TextChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            AddField(tbl, null, "已处理里程碑等级 processedMilestoneLevel", out _routeMilestone);
            _routeMilestone.TextChanged += delegate(object s, EventArgs e) { MarkDirty(); };

            Label sl = new Label();
            sl.Text = "命格注入（技能ID / 名称 / 等级，可增删行）：";
            sl.AutoSize = true;
            sl.Margin = new Padding(6, 10, 6, 2);
            tbl.RowCount++;
            tbl.Controls.Add(sl, 0, tbl.RowCount - 1);
            tbl.SetColumnSpan(sl, 2);

            _routeSkills = MakeDGV();
            _routeSkills.Height = 170;
            _routeSkills.Margin = new Padding(6, 2, 6, 2);
            DataGridViewTextBoxColumn c1 = new DataGridViewTextBoxColumn();
            c1.Name = "skillId"; c1.HeaderText = "技能ID"; c1.Width = 110;
            _routeSkills.Columns.Add(c1);
            DataGridViewTextBoxColumn c2 = new DataGridViewTextBoxColumn();
            c2.Name = "skillName"; c2.HeaderText = "名称"; c2.Width = 90; c2.ReadOnly = true;
            _routeSkills.Columns.Add(c2);
            DataGridViewTextBoxColumn c3 = new DataGridViewTextBoxColumn();
            c3.Name = "level"; c3.HeaderText = "等级"; c3.Width = 70;
            _routeSkills.Columns.Add(c3);
            _routeSkills.CellEndEdit += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex >= 0 && e.ColumnIndex == 0 && _routeSkills.Rows[e.RowIndex].Cells[0].Value != null)
                    _routeSkills.Rows[e.RowIndex].Cells[1].Value = SkillDisplay(Convert.ToString(_routeSkills.Rows[e.RowIndex].Cells[0].Value));
                MarkDirty();
            };
            _routeSkills.CellValueChanged += delegate(object s, DataGridViewCellEventArgs e) { MarkDirty(); };
            tbl.RowCount++;
            tbl.Controls.Add(_routeSkills, 0, tbl.RowCount - 1);
            tbl.SetColumnSpan(_routeSkills, 2);

            Button apply = new Button();
            apply.Text = "应用到命途";
            apply.AutoSize = true;
            apply.Margin = new Padding(6, 8, 6, 2);
            apply.Click += delegate(object s, EventArgs e) { ApplyRouteToPayload(); };
            tbl.RowCount++;
            tbl.Controls.Add(apply, 0, tbl.RowCount - 1);
            tbl.SetColumnSpan(apply, 2);

            f.Controls.Add(tbl);
            page.Controls.Add(f);
            return page;
        }

        // ============ 小工具 ============
        static DataGridView MakeDGV()
        {
            DataGridView g = new DataGridView();
            g.Dock = DockStyle.Top;
            g.AutoGenerateColumns = false;
            g.AllowUserToAddRows = true;
            g.AllowUserToDeleteRows = true;
            g.RowHeadersVisible = false;
            g.AllowUserToResizeRows = false;
            g.EditMode = DataGridViewEditMode.EditOnKeystrokeOrF2;
            g.BackgroundColor = Color.White;
            return g;
        }

        TextBox AddFieldRow(TableLayoutPanel t, int row, string label, out TextBox tb)
        {
            int sp = label.IndexOf(' ');
            string display = sp > 0 ? label.Substring(0, sp) : label;
            Label l = new Label();
            l.Text = display;   // 只显示中文
            l.AutoSize = true;
            l.Anchor = AnchorStyles.Left;
            l.Margin = new Padding(2, 6, 2, 2);
            t.Controls.Add(l, 0, row);
            tb = new TextBox();
            tb.Width = 150;
            tb.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            tb.Margin = new Padding(2, 4, 2, 2);
            tb.TextChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            t.Controls.Add(tb, 1, row);
            return tb;
        }

        NumericUpDown AddSpinRow(TableLayoutPanel t, int row, string label, out NumericUpDown n)
        {
            int sp = label.IndexOf(' ');
            string display = sp > 0 ? label.Substring(0, sp) : label;
            Label l = new Label();
            l.Text = display;   // 只显示中文
            l.AutoSize = true;
            l.Anchor = AnchorStyles.Left;
            l.Margin = new Padding(2, 6, 2, 2);
            t.Controls.Add(l, 0, row);
            n = new NumericUpDown();
            n.Width = 110;
            n.Maximum = 999999999;
            n.Anchor = AnchorStyles.Left;
            n.Margin = new Padding(2, 4, 2, 2);
            n.ValueChanged += delegate(object s, EventArgs e) { MarkDirty(); };
            t.Controls.Add(n, 1, row);
            return n;
        }

        void AddField(TableLayoutPanel tbl, Dictionary<string, TextBox> store, string label, out TextBox tb)
        {
            int sp = label.IndexOf(' ');
            string key = sp > 0 ? label.Substring(sp + 1) : label;
            string display = sp > 0 ? label.Substring(0, sp) : label;
            tb = new TextBox();
            tb.Width = 220;
            tb.Margin = new Padding(6, 2, 6, 2);
            if (store != null) store[key] = tb;
            tbl.RowCount++;
            Label l = new Label();
            l.Text = display;   // 只显示中文
            l.AutoSize = true;
            l.Margin = new Padding(6, 4, 6, 2);
            tbl.Controls.Add(l, 0, tbl.RowCount - 1);
            tbl.Controls.Add(tb, 1, tbl.RowCount - 1);
        }

        // ============ 数据填充 ============
        static bool IsGear(Dictionary<string, object> item)
        {
            return item.ContainsKey("rarity") || item.ContainsKey("affixes")
                || item.ContainsKey("enhanceLevel") || item.ContainsKey("artifactSourceBaseId");
        }

        static string SlotName(Dictionary<string, object> eg, string iid)
        {
            if (eg == null || iid == null) return "";
            object v;
            if (eg.TryGetValue("weapon", out v) && Convert.ToString(v) == iid) return "武器";
            if (eg.TryGetValue("armor", out v) && Convert.ToString(v) == iid) return "护甲";
            if (eg.TryGetValue("accessory", out v) && Convert.ToString(v) == iid) return "饰品";
            return "";
        }

        string FormatGear(Dictionary<string, object> item, Dictionary<string, object> eg)
        {
            object v;
            string defId = item.TryGetValue("defId", out v) ? Convert.ToString(v) : "?";
            string rarity = item.TryGetValue("rarity", out v) ? Convert.ToString(v) : "";
            string lvl = item.TryGetValue("level", out v) ? NumDisplay(v) : "";
            string enh = item.TryGetValue("enhanceLevel", out v) ? NumDisplay(v) : "";
            string iid = item.TryGetValue("instanceId", out v) ? Convert.ToString(v) : "";
            string slot = SlotName(eg, iid);
            string name = ItemDisplayName(defId);
            string rarityCn = RarityName(rarity);
            string idPart = name == defId ? "" : "(" + defId + ")";
            return (slot.Length > 0 ? "[" + slot + "] " : "") + name + idPart
                + (rarityCn.Length > 0 ? " " + rarityCn : "") + " Lv" + lvl + " +" + enh;
        }

        static string FormatCard(string id, Dictionary<string, object> c)
        {
            string w = "0", g = "0", b = "0", p = "0", gd = "0";
            object v;
            if (c != null)
            {
                if (c.TryGetValue("white", out v)) w = NumDisplay(v);
                if (c.TryGetValue("green", out v)) g = NumDisplay(v);
                if (c.TryGetValue("blue", out v)) b = NumDisplay(v);
                if (c.TryGetValue("purple", out v)) p = NumDisplay(v);
                if (c.TryGetValue("gold", out v)) gd = NumDisplay(v);
            }
            string name = ItemDisplayName(id);
            string idPart = name == id ? "" : "(" + id + ")";
            return name + idPart + "  白" + w + " 绿" + g + " 蓝" + b + " 紫" + p + " 金" + gd;
        }

        Dictionary<string, object> FindOwnedCards()
        {
            if (_payload == null) return null;
            object prog, profo, tco, ow;
            if (!(_payload.TryGetValue("progress", out prog) && prog is Dictionary<string, object>)) return null;
            Dictionary<string, object> pd = (Dictionary<string, object>)prog;
            if (!(pd.TryGetValue("profile", out profo) && profo is Dictionary<string, object>)) return null;
            Dictionary<string, object> profile = (Dictionary<string, object>)profo;
            if (!(profile.TryGetValue("towerCardCollection", out tco) && tco is Dictionary<string, object>)) return null;
            Dictionary<string, object> tc = (Dictionary<string, object>)tco;
            if (!(tc.TryGetValue("owned", out ow) && ow is Dictionary<string, object>)) return null;
            return (Dictionary<string, object>)ow;
        }

        void PopulateNewTabs()
        {
            _equipList.Items.Clear();
            _equipIndexes.Clear();
            _cardList.Items.Clear();
            _cardIds.Clear();
            if (_routeSkills != null) _routeSkills.Rows.Clear();
            if (_equipAffixes != null) _equipAffixes.Rows.Clear();
            foreach (KeyValuePair<string, TextBox> kv in _charEntries) kv.Value.Text = "";
            foreach (KeyValuePair<string, TextBox> kv in _medEntries) kv.Value.Text = "";
            if (_routeText != null) { _routeText.Text = ""; _routePending.Text = ""; _routeMilestone.Text = ""; _routeNameLabel.Text = "（中文名）"; }
            if (_equipSlotLabel != null) { _equipSlotLabel.Text = "槽位：-"; _equipAffixNameLabel.Text = "词缀名：-"; }
            if (_payload == null) return;

            Dictionary<string, object> gs = GetGameState();
            Dictionary<string, object> p2 = null;
            object p2o;
            if (gs != null && gs.TryGetValue("p2", out p2o)) p2 = p2o as Dictionary<string, object>;

            if (p2 != null)
            {
                object v;
                Put(_charEntries, "playerLevel", p2.TryGetValue("playerLevel", out v) ? v : null);
                Put(_charEntries, "playerExp", p2.TryGetValue("playerExp", out v) ? v : null);
                Put(_charEntries, "freeAttributePoints", p2.TryGetValue("freeAttributePoints", out v) ? v : null);
                Dictionary<string, object> pa = null;
                object pao;
                if (p2.TryGetValue("primaryAttributes", out pao)) pa = pao as Dictionary<string, object>;
                if (pa != null)
                {
                    string[] keys = { "strength", "agility", "constitution", "perception" };
                    foreach (string k in keys)
                        Put(_charEntries, "primaryAttributes." + k, pa.TryGetValue(k, out v) ? v : null);
                }
                // 动态提示当前等级属性上限（推荐最大数值）
                if (_charTip != null)
                {
                    object lvObj;
                    int lv = p2.TryGetValue("playerLevel", out lvObj) ? Convert.ToInt32(Convert.ToDouble(lvObj)) : 0;
                    int cap = Math.Max(0, (lv - 1) * 2);
                    int maxSingle = 5 + cap;
                    _charTip.Text = "当前 Lv" + lv + "：力量/敏捷/体质/感知 每项基础 5 点，四项额外加成加起来最多 " + cap
                        + " 点（单项最高 " + maxSingle + "）。超过会被游戏重置，建议四项额外加成合计 ≤ " + cap + " 点，或调高等级。";
                }
                Put(_medEntries, "awakeningStage", p2.TryGetValue("awakeningStage", out v) ? v : null);
                Put(_medEntries, "awakeningExpMultiplier", p2.TryGetValue("awakeningExpMultiplier", out v) ? v : null);
                Put(_medEntries, "cloneAge", p2.TryGetValue("cloneAge", out v) ? v : null);
                Put(_medEntries, "telomereOverloadDebt", p2.TryGetValue("telomereOverloadDebt", out v) ? v : null);
                object so;
                if (p2.TryGetValue("specialization", out so) && so is Dictionary<string, object>)
                {
                    Dictionary<string, object> sp = (Dictionary<string, object>)so;
                    object sv;
                    _routeText.Text = sp.TryGetValue("selectedRoute", out sv) ? Convert.ToString(sv) : "";
                    _routeNameLabel.Text = "＝ " + RouteDisplay(_routeText.Text);
                    _routePending.Text = sp.TryGetValue("pendingChoices", out sv) ? NumDisplay(sv) : "";
                    _routeMilestone.Text = sp.TryGetValue("processedMilestoneLevel", out sv) ? NumDisplay(sv) : "";
                    object slo;
                    if (sp.TryGetValue("skillLevels", out slo) && slo is Dictionary<string, object>)
                        foreach (KeyValuePair<string, object> kv2 in (Dictionary<string, object>)slo)
                            _routeSkills.Rows.Add(kv2.Key, SkillDisplay(kv2.Key), NumDisplay(kv2.Value));
                }
            }

            if (gs != null)
            {
                object io, ego;
                List<object> inv = gs.TryGetValue("inventory", out io) ? io as List<object> : null;
                Dictionary<string, object> eg = null;
                if (p2 != null && p2.TryGetValue("equippedGear", out ego)) eg = ego as Dictionary<string, object>;
                if (inv != null)
                {
                    for (int i = 0; i < inv.Count; i++)
                    {
                        Dictionary<string, object> item = inv[i] as Dictionary<string, object>;
                        if (item == null || !IsGear(item)) continue;
                        _equipIndexes.Add(i);
                        _equipList.Items.Add(FormatGear(item, eg));
                    }
                }
            }
            if (_equipIndexes.Count == 0) _equipList.Items.Add("（无装备）");

            Dictionary<string, object> owned = FindOwnedCards();
            if (owned != null)
                foreach (KeyValuePair<string, object> kv2 in owned)
                {
                    _cardIds.Add(kv2.Key);
                    _cardList.Items.Add(FormatCard(kv2.Key, kv2.Value as Dictionary<string, object>));
                }
            if (_cardIds.Count == 0) _cardList.Items.Add("（无卡牌）");
            else _cardList.SelectedIndex = 0;  // 自动选中第一张：改数量立即生效
            if (_equipIndexes.Count > 0) _equipList.SelectedIndex = 0;  // 自动选中第一件装备
            _cardWhite.Value = 0; _cardGreen.Value = 0; _cardBlue.Value = 0;
            _cardPurple.Value = 0; _cardGold.Value = 0;
        }

        // ============ 装备 ============
        void OnEquipSelect()
        {
            int sel = _equipList.SelectedIndex;
            if (sel < 0 || sel >= _equipIndexes.Count || _payload == null) return;
            Dictionary<string, object> gs = GetGameState();
            if (gs == null) return;
            object io;
            List<object> inv = gs.TryGetValue("inventory", out io) ? io as List<object> : null;
            if (inv == null || _equipIndexes[sel] >= inv.Count) return;
            Dictionary<string, object> item = inv[_equipIndexes[sel]] as Dictionary<string, object>;
            if (item == null) return;
            object v;
            _equipLevel.Text = item.TryGetValue("level", out v) ? NumDisplay(v) : "";
            _equipEnhance.Text = item.TryGetValue("enhanceLevel", out v) ? NumDisplay(v) : "";
            _equipUpgrade.Text = item.TryGetValue("upgradeLevel", out v) ? NumDisplay(v) : "";
            _equipDurability.Text = item.TryGetValue("durability", out v) ? NumDisplay(v) : "";
            _equipRarity.Text = item.TryGetValue("rarity", out v) ? Convert.ToString(v) : "";
            _equipQuality.Text = item.TryGetValue("qualityTier", out v) ? Convert.ToString(v) : "";
            _equipLocked.Checked = item.TryGetValue("locked", out v) && v is bool && (bool)v;
            object p2o, ego;
            Dictionary<string, object> p2 = null, eg = null;
            if (gs.TryGetValue("p2", out p2o)) p2 = p2o as Dictionary<string, object>;
            if (p2 != null && p2.TryGetValue("equippedGear", out ego)) eg = ego as Dictionary<string, object>;
            string iid = item.TryGetValue("instanceId", out v) ? Convert.ToString(v) : "";
            string slot = SlotName(eg, iid);
            _equipSlotLabel.Text = "槽位：" + (slot.Length > 0 ? slot : "未装备");
            _equipAffixNameLabel.Text = "词缀名：" + (item.TryGetValue("affixName", out v) ? Convert.ToString(v) : "-");
            _equipAffixes.Rows.Clear();
            object ao;
            if (item.TryGetValue("affixes", out ao) && ao is List<object>)
                foreach (object ax in (List<object>)ao)
                {
                    Dictionary<string, object> a = ax as Dictionary<string, object>;
                    if (a == null) continue;
                    object av;
                    string id2 = a.TryGetValue("affixId", out av) ? Convert.ToString(av) : "";
                    string val = a.TryGetValue("value", out av) ? NumDisplay(av) : "";
                    _equipAffixes.Rows.Add(id2, val);
                }
        }

        static void SetItemNum(Dictionary<string, object> item, string key, TextBox tb)
        {
            if (string.IsNullOrWhiteSpace(tb.Text)) return;
            double d;
            if (!double.TryParse(tb.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out d))
                throw new FormatException("字段 " + key + " 需要数字: " + tb.Text.Trim());
            item[key] = d;
        }

        void ApplyEquipCore()
        {
            int sel = _equipList.SelectedIndex;
            if (sel < 0 || sel >= _equipIndexes.Count || _payload == null) return;
            Dictionary<string, object> gs = GetGameState();
            if (gs == null) return;
            object io;
            List<object> inv = gs.TryGetValue("inventory", out io) ? io as List<object> : null;
            if (inv == null || _equipIndexes[sel] >= inv.Count) return;
            Dictionary<string, object> item = inv[_equipIndexes[sel]] as Dictionary<string, object>;
            if (item == null) return;
            SetItemNum(item, "level", _equipLevel);
            SetItemNum(item, "enhanceLevel", _equipEnhance);
            SetItemNum(item, "upgradeLevel", _equipUpgrade);
            SetItemNum(item, "durability", _equipDurability);
            if (_equipRarity.Text.Trim().Length > 0) item["rarity"] = _equipRarity.Text.Trim();
            if (_equipQuality.Text.Trim().Length > 0) item["qualityTier"] = _equipQuality.Text.Trim();
            item["locked"] = _equipLocked.Checked;
            _equipAffixes.EndEdit();
            List<object> affixes = new List<object>();
            foreach (DataGridViewRow row in _equipAffixes.Rows)
            {
                if (row.IsNewRow) continue;
                object c0 = row.Cells[0].Value;
                object c1 = row.Cells[1].Value;
                if (c0 == null || Convert.ToString(c0).Trim().Length == 0) continue;
                Dictionary<string, object> a = new Dictionary<string, object>();
                a["affixId"] = Convert.ToString(c0).Trim();
                double av = 0;
                if (c1 != null && double.TryParse(Convert.ToString(c1), NumberStyles.Float, CultureInfo.InvariantCulture, out av))
                    a["value"] = av;
                else
                    a["value"] = 0;
                affixes.Add(a);
            }
            item["affixes"] = affixes;
            object p2o, ego;
            Dictionary<string, object> p2 = null, eg = null;
            if (gs.TryGetValue("p2", out p2o)) p2 = p2o as Dictionary<string, object>;
            if (p2 != null && p2.TryGetValue("equippedGear", out ego)) eg = ego as Dictionary<string, object>;
            if (sel < _equipList.Items.Count)
                _equipList.Items[sel] = FormatGear(item, eg);
        }

        void ApplyEquipToPayload()
        {
            try
            {
                int sel = _equipList.SelectedIndex;
                if (sel < 0 || sel >= _equipIndexes.Count || _payload == null)
                {
                    SetStatus("请先在左侧选择一件装备");
                    return;
                }
                ApplyEquipCore();
                MarkDirty();
                SetStatus("已应用装备修改（记得点“写入修改”）");
            }
            catch (FormatException ex)
            {
                Msg(ex.Message, "输入错误", MessageBoxIcon.Error);
            }
        }

        // ============ 卡牌 ============
        void OnCardSelect()
        {
            int sel = _cardList.SelectedIndex;
            if (sel < 0 || sel >= _cardIds.Count) return;
            Dictionary<string, object> owned = FindOwnedCards();
            if (owned == null) return;
            object co;
            Dictionary<string, object> c = owned.TryGetValue(_cardIds[sel], out co) ? co as Dictionary<string, object> : null;
            if (c == null) return;
            object v;
            _cardWhite.Value = c.TryGetValue("white", out v) ? (decimal)(double)v : 0;
            _cardGreen.Value = c.TryGetValue("green", out v) ? (decimal)(double)v : 0;
            _cardBlue.Value = c.TryGetValue("blue", out v) ? (decimal)(double)v : 0;
            _cardPurple.Value = c.TryGetValue("purple", out v) ? (decimal)(double)v : 0;
            _cardGold.Value = c.TryGetValue("gold", out v) ? (decimal)(double)v : 0;
        }

        // 卡牌数量一改立即应用到 _payload（选中卡时），写入修改直接落盘
        void OnCardSpin()
        {
            MarkDirty();
            if (_cardList.SelectedIndex >= 0 && _cardList.SelectedIndex < _cardIds.Count)
                ApplyCardCore();
        }

        void ApplyCardCore()
        {
            int sel = _cardList.SelectedIndex;
            if (sel < 0 || sel >= _cardIds.Count) return;
            Dictionary<string, object> owned = FindOwnedCards();
            if (owned == null) return;
            string cid = _cardIds[sel];
            Dictionary<string, object> c = new Dictionary<string, object>();
            c["white"] = (double)_cardWhite.Value;
            c["green"] = (double)_cardGreen.Value;
            c["blue"] = (double)_cardBlue.Value;
            c["purple"] = (double)_cardPurple.Value;
            c["gold"] = (double)_cardGold.Value;
            owned[cid] = c;
            if (sel < _cardList.Items.Count) _cardList.Items[sel] = FormatCard(cid, c);
        }

        void ApplyCardToPayload()
        {
            int sel = _cardList.SelectedIndex;
            if (sel < 0 || sel >= _cardIds.Count || _payload == null)
            {
                SetStatus("请先在左侧选择一张卡牌");
                return;
            }
            ApplyCardCore();
            MarkDirty();
            SetStatus("已应用卡牌修改（记得点“写入修改”）");
        }

        void FillAllCards(int qty)
        {
            Dictionary<string, object> owned = FindOwnedCards();
            if (owned == null) return;
            foreach (string cid in _cardIds)
            {
                Dictionary<string, object> c = new Dictionary<string, object>();
                c["white"] = (double)qty; c["green"] = (double)qty; c["blue"] = (double)qty;
                c["purple"] = (double)qty; c["gold"] = (double)qty;
                owned[cid] = c;
            }
            for (int i = 0; i < _cardIds.Count && i < _cardList.Items.Count; i++)
                _cardList.Items[i] = FormatCard(_cardIds[i], owned[_cardIds[i]] as Dictionary<string, object>);
            MarkDirty();
            SetStatus("已将全部卡牌各稀有度设为 " + qty + "（记得点“写入修改”）");
        }

        void FillGoldCards(int qty)
        {
            Dictionary<string, object> owned = FindOwnedCards();
            if (owned == null) return;
            foreach (string cid in _cardIds)
            {
                Dictionary<string, object> c = null;
                object co;
                if (owned.TryGetValue(cid, out co)) c = co as Dictionary<string, object>;
                if (c == null) { c = new Dictionary<string, object>(); owned[cid] = c; }
                if (!c.ContainsKey("white")) c["white"] = 0;
                if (!c.ContainsKey("green")) c["green"] = 0;
                if (!c.ContainsKey("blue")) c["blue"] = 0;
                if (!c.ContainsKey("purple")) c["purple"] = 0;
                c["gold"] = (double)qty;
            }
            for (int i = 0; i < _cardIds.Count && i < _cardList.Items.Count; i++)
                _cardList.Items[i] = FormatCard(_cardIds[i], owned[_cardIds[i]] as Dictionary<string, object>);
            MarkDirty();
            SetStatus("已将全部卡牌金色设为 " + qty + "（记得点“写入修改”）");
        }

        // ============ 命途 ============
        void ApplyRouteCore()
        {
            Dictionary<string, object> gs = GetGameState();
            if (gs == null) return;
            object p2o;
            Dictionary<string, object> p2 = gs.TryGetValue("p2", out p2o) ? p2o as Dictionary<string, object> : null;
            if (p2 == null) return;
            object so;
            Dictionary<string, object> sp = p2.TryGetValue("specialization", out so) ? so as Dictionary<string, object> : null;
            if (sp == null) { sp = new Dictionary<string, object>(); p2["specialization"] = sp; }
            if (_routeText.Text.Trim().Length > 0) sp["selectedRoute"] = _routeText.Text.Trim();
            if (_routePending.Text.Trim().Length > 0)
            {
                double d;
                if (double.TryParse(_routePending.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out d))
                    sp["pendingChoices"] = d;
                else throw new FormatException("字段 pendingChoices 需要数字: " + _routePending.Text.Trim());
            }
            if (_routeMilestone.Text.Trim().Length > 0)
            {
                double d;
                if (double.TryParse(_routeMilestone.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out d))
                    sp["processedMilestoneLevel"] = d;
                else throw new FormatException("字段 processedMilestoneLevel 需要数字: " + _routeMilestone.Text.Trim());
            }
            _routeSkills.EndEdit();
            Dictionary<string, object> skills = new Dictionary<string, object>();
            foreach (DataGridViewRow row in _routeSkills.Rows)
            {
                if (row.IsNewRow) continue;
                object c0 = row.Cells[0].Value;
                object c1 = row.Cells[2].Value;
                if (c0 == null || Convert.ToString(c0).Trim().Length == 0) continue;
                string sid = Convert.ToString(c0).Trim();
                double lv = 0;
                if (c1 != null && double.TryParse(Convert.ToString(c1), NumberStyles.Float, CultureInfo.InvariantCulture, out lv))
                    skills[sid] = lv;
                else
                    skills[sid] = 0;
            }
            sp["skillLevels"] = skills;
        }

        void ApplyRouteToPayload()
        {
            try
            {
                if (GetGameState() == null)
                {
                    SetStatus("当前存档没有进行中的局");
                    return;
                }
                ApplyRouteCore();
                MarkDirty();
                SetStatus("已应用命途修改（记得点“写入修改”）");
            }
            catch (FormatException ex)
            {
                Msg(ex.Message, "输入错误", MessageBoxIcon.Error);
            }
        }

        // ============ 写入修改时的自动应用（DoSave 调用） ============
        // 游戏按经验反推等级：Ci(e)=120*(e-1)+24*(e-1)^2，经验必须 ≥ Ci(等级)
        static double ExpForLevel(double level)
        {
            if (level <= 1) return 0;
            double t = level - 1;
            return Math.Floor(120 * t + 24 * t * t);
        }

        void ApplyNewTabsBeforeSave()
        {
            Dictionary<string, object> gs = GetGameState();
            if (gs == null) return;
            object p2o;
            Dictionary<string, object> p2 = gs.TryGetValue("p2", out p2o) ? p2o as Dictionary<string, object> : null;
            if (p2 == null)
            {
                foreach (KeyValuePair<string, TextBox> kv in _charEntries)
                    if (!string.IsNullOrWhiteSpace(kv.Value.Text))
                        throw new FormatException("当前存档没有 P2 数据，不能修改该字段: " + kv.Key);
                foreach (KeyValuePair<string, TextBox> kv in _medEntries)
                    if (!string.IsNullOrWhiteSpace(kv.Value.Text))
                        throw new FormatException("当前存档没有 P2 数据，不能修改该字段: " + kv.Key);
                return;
            }
            foreach (KeyValuePair<string, TextBox> kv in _charEntries)
            {
                bool empty;
                long? v = GetInt(kv.Value, kv.Key, out empty);
                if (empty) continue;
                if (kv.Key.StartsWith("primaryAttributes.")) SetDotted(p2, kv.Key, (double)v.Value);
                else p2[kv.Key] = (double)v.Value;
            }
            // 等级↔经验联动：游戏按经验反推等级，改等级时自动补齐所需经验，否则等级不生效
            object lvObj;
            if (p2.TryGetValue("playerLevel", out lvObj) && lvObj is double && (double)lvObj > 1)
            {
                double lv = (double)lvObj;
                double need = ExpForLevel(lv);
                object exObj;
                double curExp = p2.TryGetValue("playerExp", out exObj) && exObj is double ? (double)exObj : 0;
                if (curExp < need)
                {
                    p2["playerExp"] = need;
                    TextBox tb;
                    if (_charEntries.TryGetValue("playerExp", out tb))
                    {
                        tb.Text = NumDisplay(need);
                        LogWrite("等级联动: 经验不足，已自动设为 " + NumDisplay(need) + "（支撑 Lv." + NumDisplay(lv) + "）");
                    }
                }
            }
            foreach (KeyValuePair<string, TextBox> kv in _medEntries)
            {
                if (kv.Key == "awakeningExpMultiplier")
                {
                    bool empty;
                    double? v = GetNum(kv.Value, kv.Key, out empty);
                    if (!empty) p2[kv.Key] = v.Value;
                }
                else
                {
                    bool empty;
                    long? v = GetInt(kv.Value, kv.Key, out empty);
                    if (!empty) p2[kv.Key] = (double)v.Value;
                }
            }
            if (_equipList.SelectedIndex >= 0 && _equipList.SelectedIndex < _equipIndexes.Count)
                ApplyEquipCore();
            if (_equipForgeAll != null && _equipForgeAll.Checked)
            {
                Dictionary<string, object> prog;
                object po;
                if (p2.TryGetValue("artifactUnlockProgress", out po))
                    prog = po as Dictionary<string, object>;
                else prog = null;
                if (prog == null) { prog = new Dictionary<string, object>(); p2["artifactUnlockProgress"] = prog; }
                prog["bleedStacksApplied"] = (double)100;
                prog["stunAppliedCount"] = (double)120;
                prog["maxSingleCritDamage"] = (double)10000;
                prog["suppressionAccuracyReduction"] = (double)3000;
                prog["gatlingBulletsFired"] = (double)3000;
                prog["evasionTriggeredCount"] = (double)120;
                prog["counterDamageDealt"] = (double)20000;
                prog["shieldConsumedTotal"] = (double)40000;
                prog["exoChargeInterruptCount"] = (double)40;
                LogWrite("神器锻造：已解锁全部 9 件神器（需蓝图碎片×30、外星合金×15、尸王晶核×800 + 对应金装方可锻造）");
            }
            if (_cardList.SelectedIndex >= 0 && _cardList.SelectedIndex < _cardIds.Count)
                ApplyCardCore();
            ApplyRouteCore();
        }
    }
}
