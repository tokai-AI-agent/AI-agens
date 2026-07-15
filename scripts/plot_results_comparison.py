# -*- coding: utf-8 -*-
"""LLM推論のみ vs アンカー方式の結果比較グラフ（論文・レポート用）。

指標: 「イベント開始時刻に間に合わなかった試行の割合」（各条件 n=50）
出力: figures/results_comparison.png（dpi=300・白背景）

数値の出典（2026-07-14 全キャンペーン確定値。1試行=1行のJSONLログから集計）:
  - LLM推論のみ（ベースライン）:
      易条件: logs/baseline-system-easy-50.jsonl  (minatomirai-fireworks-baseline-system-easy)
      H1:     logs/hard-h1.jsonl                  (h1-baseline)
      G1:     logs/general-g1.jsonl               (g1-baseline)
      G2:     logs/general-g2.jsonl               (g2-baseline)
  - アンカー方式（hint=off、アンカー方式に最も不利な条件）:
      易条件: logs/main-baseline-aligned-50x2-run2.jsonl (minatomirai-fireworks-baseline-aligned)
      H1:     logs/hard-h1.jsonl                  (h1-anchored)
      G1:     logs/general-g1.jsonl               (g1-anchored)
      G2:     logs/general-g2.jsonl               (g2-anchored)
  ログから再集計する場合は scripts/summarize-campaign.ts / scripts/make_figures.py を参照。

使い方: python scripts/plot_results_comparison.py  （travel-agent直下で実行）
"""
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


# ---- 日本語フォント設定（文字化け防止） ----
def setup_japanese_font():
    try:
        import japanize_matplotlib  # noqa: F401  # インストール済みならこれだけで完結
        return "japanize-matplotlib"
    except ImportError:
        pass
    from matplotlib import font_manager
    available = {f.name for f in font_manager.fontManager.ttflist}
    for name in ["Meiryo", "Yu Gothic", "MS Gothic", "Noto Sans CJK JP", "IPAexGothic"]:
        if name in available:
            plt.rcParams["font.family"] = name
            return name
    raise RuntimeError(
        "日本語フォントが見つかりません。`pip install japanize-matplotlib` を実行してください")


FONT = setup_japanese_font()
plt.rcParams.update({
    "font.size": 13,
    "axes.titlesize": 15,
    "axes.labelsize": 13,
    "legend.fontsize": 12,
    "axes.unicode_minus": False,  # 日本語フォントにU+2212が無い場合の文字化け防止
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "savefig.facecolor": "white",
})

# ---- 配色（他の発表図と統一。白背景でCVDセーフ検証済み） ----
C_LLM = "#2a78d6"     # LLM推論のみ（ベースライン）
C_ANCHOR = "#1baf7a"  # アンカー方式
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e1e0d9"

# ---- 実験結果データ（間に合わなかった試行数 / 50） ----
CONDITIONS = [
    # (表示名, x軸下段の補足, LLM推論のみの失敗数, アンカー方式の失敗数)
    ("易条件",        "横浜・花火 / 移動40分",       17, 0),
    ("H1（難条件）",  "横浜・花火 / 移動90分・渋滞", 48, 0),
    ("G1",            "東京・昼公演 / 移動45分",     7,  0),
    ("G2",            "京都・宵山 / 移動50分",       6,  0),
]
N = 50  # 各条件・各手法の試行数


def main():
    labels = [f"{name}\n{note}" for name, note, _, _ in CONDITIONS]
    llm_rate = [100 * fail / N for _, _, fail, _ in CONDITIONS]
    anchor_rate = [100 * fail / N for _, _, _, fail in CONDITIONS]

    fig, ax = plt.subplots(figsize=(11, 6.5))
    xpos = range(len(CONDITIONS))
    width = 0.38

    bars_llm = ax.bar([x - width / 2 for x in xpos], llm_rate, width,
                      color=C_LLM, label="LLM推論のみ", zorder=3)
    bars_anchor = ax.bar([x + width / 2 for x in xpos], anchor_rate, width,
                         color=C_ANCHOR, label="アンカー方式", zorder=3)

    # 各棒の上に数値ラベル（件数と割合）
    for (name, note, fail_llm, fail_anchor), x in zip(CONDITIONS, xpos):
        ax.annotate(f"{fail_llm}/{N}\n({100 * fail_llm / N:.0f}%)",
                    (x - width / 2, 100 * fail_llm / N),
                    ha="center", va="bottom", fontsize=12, color=INK)
        ax.annotate(f"{fail_anchor}/{N}\n({100 * fail_anchor / N:.0f}%)",
                    (x + width / 2, 100 * fail_anchor / N),
                    ha="center", va="bottom", fontsize=12, color=INK, fontweight="bold")
        # 手法差（ポイント）を各グループ上部に表示
        diff = 100 * (fail_anchor - fail_llm) / N
        ax.annotate(f"差 {diff:+.0f}pt", (x, max(100 * fail_llm / N, 8) + 9.5),
                    ha="center", fontsize=12, color=INK_2)

    ax.set_ylabel("イベント開始時刻に間に合わなかった割合（%）")
    ax.set_title("手法別の失敗率の比較（各条件 n=50）— アンカー方式は全条件で0%", color=INK)
    ax.set_xticks(list(xpos))
    ax.set_xticklabels(labels)
    ax.set_ylim(0, 112)
    ax.set_yticks(range(0, 101, 20))
    ax.legend(frameon=False, loc="upper right")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", color=GRID, linewidth=1)
    ax.set_axisbelow(True)
    ax.tick_params(colors=INK_2)

    fig.tight_layout()
    os.makedirs("figures", exist_ok=True)
    out = os.path.join("figures", "results_comparison.png")
    fig.savefig(out, dpi=300)
    print(f"font={FONT}")
    print(f"saved: {out}")


if __name__ == "__main__":
    main()
