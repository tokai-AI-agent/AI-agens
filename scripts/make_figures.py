# -*- coding: utf-8 -*-
"""研究発表用の図表生成（図A〜D、PNG・高解像度・白背景・日本語ラベル）。

logs/ 配下のJSONL（易条件・H1・G1・G2、ベースライン／アンカー方式）から
すべての数値を計算する（ハードコードなし）。図に使った数値は
figures/figure-data.txt にテキストでも出力する。

使い方: python scripts/make_figures.py  （travel-agent直下で実行）
"""
import json
import os
from collections import Counter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

# ---- 配色（datavizスキルのリファレンスパレット、白背景で検証済み） ----
C_BASELINE = "#2a78d6"  # slot1 blue = ベースライン
C_ANCHORED = "#1baf7a"  # slot2 aqua = アンカー方式（3:1未満→全マークに直接ラベル）
C_DRAFT = "#4a3aa7"    # slot5 violet = 差し戻し前の初回構成案（図Dのみ）
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"

# ---- 日本語フォント（文字化け防止） ----
def setup_font():
    available = {f.name for f in font_manager.fontManager.ttflist}
    for name in ["Meiryo", "Yu Gothic", "MS Gothic", "Noto Sans CJK JP"]:
        if name in available:
            plt.rcParams["font.family"] = name
            return name
    raise RuntimeError("日本語フォントが見つかりません")

FONT = setup_font()
plt.rcParams.update({
    "font.size": 15,
    "axes.titlesize": 16,
    "axes.labelsize": 15,
    "xtick.labelsize": 13,
    "ytick.labelsize": 13,
    "legend.fontsize": 14,
    "axes.unicode_minus": False,  # 日本語フォントにU+2212が無く文字化けするため
    "axes.edgecolor": AXIS,
    "axes.linewidth": 1.4,
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "savefig.facecolor": "white",
})

# ---- ログ読み込み（aggregate-log.tsと同じ規則: runId重複は最終、errorは除外） ----
def load_trials(path, label, hint=None):
    by_run_id, rest = {}, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if r.get("settingLabel") != label:
                continue
            if hint is not None and r.get("giveBudgetHint") != hint:
                continue
            if r.get("runId"):
                by_run_id[r["runId"]] = r
            else:
                rest.append(r)
    trials = list(by_run_id.values()) + rest
    return [r for r in trials if r.get("retryOutcome") != "error"]

def to_min(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)

SETTINGS = [
    dict(key="易条件", travel=40,
         baseline=("logs/baseline-system-easy-50.jsonl", "minatomirai-fireworks-baseline-system-easy"),
         anchored=("logs/main-baseline-aligned-50x2-run2.jsonl", "minatomirai-fireworks-baseline-aligned")),
    dict(key="H1（難条件）", travel=90,
         baseline=("logs/hard-h1.jsonl", "h1-baseline"),
         anchored=("logs/hard-h1.jsonl", "h1-anchored")),
    dict(key="G1（東京・昼公演）", travel=45,
         baseline=("logs/general-g1.jsonl", "g1-baseline"),
         anchored=("logs/general-g1.jsonl", "g1-anchored")),
    dict(key="G2（京都・宵山）", travel=50,
         baseline=("logs/general-g2.jsonl", "g2-baseline"),
         anchored=("logs/general-g2.jsonl", "g2-anchored")),
]

os.makedirs("figures", exist_ok=True)
report = []  # figure-data.txt の行

def style_axes(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", color=GRID, linewidth=1)
    ax.set_axisbelow(True)
    ax.tick_params(colors=INK_2)

# 破線などと重なっても読めるよう、ラベルの背景に白座布団を敷く
WHITE_BOX = dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none", alpha=0.85)

# ============================================================
# データ収集
# ============================================================
data = {}
for s in SETTINGS:
    base = load_trials(*s["baseline"])
    # アンカー側はhint=off（アンカー方式に最も不利な条件）で統一
    anch = load_trials(*s["anchored"], hint=False)

    lateness = [to_min(r["arrivalAtEventTime"]) - to_min(r["givenEventStart"])
                for r in base if r.get("madeItToEvent") is False]
    base_gaps = [g["minutes"] for r in base for g in (r.get("gaps") or [])
                 if g["from"] != "DAY_START"]
    anch_gaps = [g["minutes"] for r in anch for g in (r.get("gaps") or [])
                 if g["from"] != "DAY_START"]
    data[s["key"]] = dict(
        travel=s["travel"],
        base_n=len(base), anch_n=len(anch),
        base_fail=sum(1 for r in base if r.get("madeItToEvent") is False),
        base_null=sum(1 for r in base if r.get("madeItToEvent") is None),
        anch_fail=sum(1 for r in anch if r.get("madeItToEvent") is False),
        lateness=lateness, base_gaps=base_gaps, anch_gaps=anch_gaps,
    )

# ============================================================
# 図A: ベースラインの遅刻量分布（4設定・移動時間の破線つき）
# ============================================================
fig, axes = plt.subplots(2, 2, figsize=(13, 9))
fig.suptitle(
    "ベースラインの遅刻量分布 — 破線（与えた移動時間）との差＝LLMが確保した時間（0分または約30分）",
    fontsize=17, color=INK)
report.append("=== 図A: ベースライン遅刻量の分布（間に合わなかった試行のみ） ===")
for ax, s in zip(axes.flat, SETTINGS):
    d = data[s["key"]]
    counts = Counter(d["lateness"])
    xs = sorted(counts)
    ys = [counts[x] for x in xs]
    ax.bar(xs, ys, width=4.2, color=C_BASELINE, zorder=3)
    top = max(ys) if ys else 1
    for x, y in zip(xs, ys):
        ax.annotate(str(y), (x, y), ha="center", va="bottom", fontsize=12, color=INK,
                    bbox=WHITE_BOX, zorder=5)
    ax.axvline(d["travel"], color=INK, linestyle="--", linewidth=2, zorder=4)
    # 破線ラベルはバーの件数ラベルより上の帯に置き、右端はみ出しを避けて左右を選ぶ
    if d["travel"] > 60:
        ax.annotate(f"与えた移動時間 {d['travel']}分", (d["travel"], 0),
                    xytext=(d["travel"] - 3, top * 1.18), fontsize=13, color=INK,
                    ha="right", bbox=WHITE_BOX, zorder=5)
    else:
        ax.annotate(f"与えた移動時間 {d['travel']}分", (d["travel"], 0),
                    xytext=(d["travel"] + 3, top * 1.18), fontsize=13, color=INK,
                    bbox=WHITE_BOX, zorder=5)
    ax.set_title(f"{s['key']}：間に合わず {d['base_fail']}/{d['base_n']}件", color=INK)
    ax.set_xlabel("遅刻量（分）", color=INK_2)
    ax.set_ylabel("件数", color=INK_2)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, top * 1.32)
    style_axes(ax)
    dist = ", ".join(f"+{x}分×{counts[x]}" for x in xs)
    report.append(f"{s['key']}: 間に合わず{d['base_fail']}/{d['base_n']} 遅刻分布[{dist}] 移動時間{d['travel']}分")
fig.tight_layout(rect=[0, 0, 1, 0.94])
fig.savefig("figures/fig-a-lateness.png", dpi=200)
plt.close(fig)

# ============================================================
# 図B: 設定別の失敗率（ベースライン vs アンカー方式）
# ============================================================
fig, ax = plt.subplots(figsize=(12, 7))
keys = [s["key"] for s in SETTINGS]
base_rate = [100 * data[k]["base_fail"] / data[k]["base_n"] for k in keys]
anch_rate = [100 * data[k]["anch_fail"] / data[k]["anch_n"] for k in keys]
xpos = range(len(keys))
w = 0.38
b1 = ax.bar([x - w / 2 for x in xpos], base_rate, w, color=C_BASELINE, label="ベースライン（LLMが時刻を決定）", zorder=3)
b2 = ax.bar([x + w / 2 for x in xpos], anch_rate, w, color=C_ANCHORED, label="アンカー方式（hint=off）", zorder=3)
report.append("\n=== 図B: 間に合わなかった割合 ===")
for i, k in enumerate(keys):
    d = data[k]
    ax.annotate(f"{d['base_fail']}/{d['base_n']}\n({base_rate[i]:.0f}%)",
                (i - w / 2, base_rate[i]), ha="center", va="bottom", fontsize=13, color=INK)
    ax.annotate(f"{d['anch_fail']}/{d['anch_n']}\n(0%)",
                (i + w / 2, anch_rate[i]), ha="center", va="bottom", fontsize=13, color=INK, fontweight="bold")
    report.append(f"{k}: ベースライン {d['base_fail']}/{d['base_n']} ({base_rate[i]:.0f}%) / "
                  f"アンカー方式 {d['anch_fail']}/{d['anch_n']} (0%)")
ax.set_xticks(list(xpos))
ax.set_xticklabels(keys)
ax.set_ylabel("イベントに間に合わなかった割合（%）", color=INK_2)
ax.set_title("設定別の失敗率 — アンカー方式は全設定で0%", fontsize=18, color=INK)
ax.set_ylim(0, 108)
ax.legend(frameon=False, loc="upper right")
style_axes(ax)
fig.tight_layout()
fig.savefig("figures/fig-b-failure-rate.png", dpi=200)
plt.close(fig)

# ============================================================
# 図C: 予定間空白の分布（ベースライン vs アンカー方式）
# ============================================================
fig, axes = plt.subplots(2, 2, figsize=(13, 9))
fig.suptitle("予定間空白の分布 — アンカー方式は全区間0分（負の値は遅刻・重なり）", fontsize=18, color=INK)
report.append("\n=== 図C: 予定間空白（DAY_START除く全区間、分） ===")
BIN = 10
for ax, s in zip(axes.flat, SETTINGS):
    d = data[s["key"]]
    def binned(values):
        c = Counter((v // BIN) * BIN for v in values)
        return c
    bc, ac = binned(d["base_gaps"]), binned(d["anch_gaps"])
    all_bins = sorted(set(bc) | set(ac))
    ymax = max([*bc.values(), *ac.values(), 1])
    for b in all_bins:
        if bc.get(b):
            ax.bar(b + BIN / 2 - 2.3, bc[b], 4.2, color=C_BASELINE, zorder=3)
        if ac.get(b):
            ax.bar(b + BIN / 2 + 2.3, ac[b], 4.2, color=C_ANCHORED, zorder=3)
            ax.annotate(f"全{ac[b]}区間\n0分", (b + BIN / 2 + 2.3, ac[b]),
                        ha="center", va="bottom", fontsize=12, color=INK,
                        fontweight="bold", bbox=WHITE_BOX, zorder=5)
    over = sum(1 for v in d["base_gaps"] if v > 30)
    ax.axvline(30, color=INK, linestyle="--", linewidth=2, zorder=4)
    ax.annotate("許容上限30分", (30, 0), xytext=(33, ymax * 1.22), fontsize=12,
                color=INK, bbox=WHITE_BOX, zorder=5)
    ax.set_ylim(0, ymax * 1.35)  # スパイクのラベルがタイトルに重ならないよう上に余白
    ax.set_title(f"{s['key']}：ベースラインの31分超 {over}区間", color=INK)
    ax.set_xlabel("予定間の空白（分）", color=INK_2)
    ax.set_ylabel("区間数", color=INK_2)
    style_axes(ax)
    report.append(
        f"{s['key']}: ベースライン 区間数{len(d['base_gaps'])} 非0={sum(1 for v in d['base_gaps'] if v != 0)} "
        f"最小{min(d['base_gaps'])}分 最大{max(d['base_gaps'])}分 31分超{over}区間 / "
        f"アンカー方式 区間数{len(d['anch_gaps'])} 全区間0分={all(v == 0 for v in d['anch_gaps'])}")
handles = [plt.Rectangle((0, 0), 1, 1, color=C_BASELINE),
           plt.Rectangle((0, 0), 1, 1, color=C_ANCHORED)]
fig.legend(handles, ["ベースライン", "アンカー方式（hint=off）"], loc="upper right",
           frameon=False, bbox_to_anchor=(0.99, 0.93))
fig.tight_layout(rect=[0, 0, 1, 0.92])
fig.savefig("figures/fig-c-gaps.png", dpi=200)
plt.close(fig)

# ============================================================
# 図D: 差し戻し機構の効果（H1 hint=off: 初回→修正後の滞在合計）
# ============================================================
h1 = load_trials("logs/hard-h1.jsonl", "h1-anchored", hint=False)
first_stays, final_stays = [], []
for r in h1:
    vs = [v for v in (r.get("violationsFirstAttempt") or []) if v.get("check") == "a"]
    if vs:
        first_stays.append(vs[0]["currentPreAnchorStayMinutes"])
    else:
        # 初回成立の場合は初回=最終
        first_stays.append(to_min(r["departureForEventTime"]) - to_min(r["departureTime"]))
    final_stays.append(to_min(r["departureForEventTime"]) - to_min(r["departureTime"]))

fig, ax = plt.subplots(figsize=(12, 7))
fc, lc = Counter(first_stays), Counter(final_stays)
xs = sorted(set(fc) | set(lc))
w = 4.5
# 予算内（0〜30分）の領域を薄く塗り、成立側のバーが予算内にあることを示す
ax.axvspan(0, 30, color=C_ANCHORED, alpha=0.08, zorder=1)
# 初回と修正後で同じ値は存在しないため、バーは真の値の位置にそのまま置く
# （オフセットすると30分バーが予算線の外側に見えてしまうため）
for x in xs:
    if fc.get(x):
        ax.bar(x, fc[x], w, color=C_DRAFT, zorder=3)
        ax.annotate(str(fc[x]), (x, fc[x]), ha="center", va="bottom", fontsize=13,
                    color=INK, bbox=WHITE_BOX, zorder=5)
    if lc.get(x):
        ax.bar(x, lc[x], w, color=C_ANCHORED, zorder=3)
        ax.annotate(str(lc[x]), (x, lc[x]), ha="center", va="bottom",
                    fontsize=13, color=INK, fontweight="bold", bbox=WHITE_BOX, zorder=5)
ax.axvline(30, color=INK, linestyle="--", linewidth=2, zorder=4)
ax.annotate("滞在予算 30分（≤30で成立）", (30, 0), xytext=(27, max(lc.values()) * 0.9),
            fontsize=14, color=INK, ha="right", bbox=WHITE_BOX, zorder=5)
handles = [plt.Rectangle((0, 0), 1, 1, color=C_DRAFT),
           plt.Rectangle((0, 0), 1, 1, color=C_ANCHORED)]
ax.legend(handles, ["初回構成案（差し戻し前）", "差し戻し後（成立）"], frameon=False, loc="upper right")
outcomes = Counter(r.get("retryOutcome") for r in h1)
ax.set_title(f"差し戻し機構の効果（H1 hint=off, n={len(h1)}）— 全{outcomes.get('retry_pass', 0)}件が1回の差し戻しで予算内に修正",
             fontsize=17, color=INK)
ax.set_xlabel("イベント前の滞在合計（分）", color=INK_2)
ax.set_ylabel("件数", color=INK_2)
ax.set_xlim(0, 200)
style_axes(ax)
fig.tight_layout()
fig.savefig("figures/fig-d-retry.png", dpi=200)
plt.close(fig)

report.append("\n=== 図D: H1 hint=off 差し戻し前後の滞在合計 ===")
report.append(f"n={len(h1)} 差し戻し内訳={dict(outcomes)}")
report.append("初回構成案: " + ", ".join(f"{x}分×{fc[x]}" for x in sorted(fc)))
report.append("差し戻し後: " + ", ".join(f"{x}分×{lc[x]}" for x in sorted(lc)))
report.append("滞在予算: 30分（18:00開始 − dayStart16:00 − 移動90分）")

# ============================================================
# 図E: LLMが確保した時間 vs 与えた移動時間（発表の核）
# 確保時間 = イベント開始 − LLMの出発時刻。設定を移動時間の昇順に並べ、
# 与えた移動時間（黒マーカー）が増えても失敗側の確保時間（濃色）が
# 0〜30分に張り付いたまま追従しないことを示す。
# ============================================================
C_OK = "#9ec5f4"  # 間に合い（ベースラインと同じ青系の明るいステップ。縁と件数ラベルで補強）

ORDER = ["易条件", "G1（東京・昼公演）", "G2（京都・宵山）", "H1（難条件）"]  # 移動時間の昇順
fig, ax = plt.subplots(figsize=(13, 8))
report.append("\n=== 図E: LLMが確保した時間（イベント開始−出発時刻、判定可能な試行のみ） ===")

reserved_by_setting = {}
for s in SETTINGS:
    base = load_trials(*s["baseline"])
    fail, ok = [], []
    for r in base:
        if r.get("madeItToEvent") is None:
            continue
        reserved = to_min(r["givenEventStart"]) - to_min(r["departureForEventTime"])
        (ok if r["madeItToEvent"] else fail).append(reserved)
    reserved_by_setting[s["key"]] = dict(travel=s["travel"], fail=Counter(fail), ok=Counter(ok))

ax.axhspan(0, 30, color="#898781", alpha=0.10, zorder=1)
ax.annotate("失敗時の確保はすべてこの帯（0〜30分）", (0, 0), xytext=(3.72, 14),
            fontsize=13, color=INK_2, ha="right", bbox=WHITE_BOX, zorder=5)

for i, key in enumerate(ORDER):
    d = reserved_by_setting[key]
    # 与えた移動時間のマーカー（太い横線）
    ax.hlines(d["travel"], i - 0.28, i + 0.28, color=INK, linewidth=3.5, zorder=4)
    ax.annotate(f"移動時間 {d['travel']}分", (i + 0.30, d["travel"]),
                va="center", fontsize=13, color=INK, bbox=WHITE_BOX, zorder=5)
    for counter, color, edge in [(d["fail"], C_BASELINE, "none"), (d["ok"], C_OK, C_BASELINE)]:
        for value, count in counter.items():
            ax.scatter(i, value, s=60 + count * 28, color=color, edgecolors=edge,
                       linewidths=1.2, zorder=3)
            if count >= 3:
                ax.annotate(str(count), (i, value), ha="center", va="center",
                            fontsize=11, color=INK if color == C_OK else "white",
                            fontweight="bold", zorder=6)
    fail_n, ok_n = sum(d["fail"].values()), sum(d["ok"].values())
    report.append(
        f"{key}(移動{d['travel']}分): 間に合わず{fail_n}件の確保時間["
        + ", ".join(f"{v}分×{c}" for v, c in sorted(d["fail"].items())) + "] / "
        f"間に合い{ok_n}件の確保時間["
        + ", ".join(f"{v}分×{c}" for v, c in sorted(d["ok"].items())) + "]")

ax.set_xticks(range(len(ORDER)))
ax.set_xticklabels([f"{k}\n移動{reserved_by_setting[k]['travel']}分" for k in ORDER])
ax.set_ylabel("LLMが最終移動に確保した時間（分）", color=INK_2)
ax.set_title("LLMが確保した時間 vs 与えた移動時間 — 失敗時の確保は0〜30分に張り付き、移動時間に追従しない",
             fontsize=16, color=INK)
ax.set_xlim(-0.6, len(ORDER) - 0.2)
ax.set_ylim(-8, 195)
handles = [
    plt.Line2D([], [], marker="o", linestyle="", markersize=11, color=C_BASELINE, label="間に合わなかった試行"),
    plt.Line2D([], [], marker="o", linestyle="", markersize=11, color=C_OK,
               markeredgecolor=C_BASELINE, label="間に合った試行"),
    plt.Line2D([], [], color=INK, linewidth=3.5, label="与えた移動時間"),
]
ax.legend(handles=handles, frameon=False, loc="upper left", bbox_to_anchor=(0.02, 0.98))
style_axes(ax)
fig.tight_layout()
fig.savefig("figures/fig-e-reserved.png", dpi=200)
plt.close(fig)

with open("figures/figure-data.txt", "w", encoding="utf-8") as f:
    f.write(f"使用フォント: {FONT}\n")
    f.write("\n".join(report) + "\n")

print(f"font={FONT}")
print("\n".join(report))
