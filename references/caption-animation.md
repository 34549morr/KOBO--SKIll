# 字幕动画（13 条）

WebVTT 不能给单个词写内联样式，所以动画靠「cue 内的 class + STYLE 块里的 @keyframes」。每条 cue 的关键词裹成：

    <c.c2.kwpop.d3>瓶颈</c>

- c1..c3：这一行用到的三种字色（按 plan 的配色顺序）。
- kwpop…kwline：13 条动画之一，按 (行号*5 + 词序*3) % 13 轮转，保证同屏不重复。
- d1..d6：进场延迟（0.09s 的倍数），让一行里的词按语序依次出现。

## 13 条

| class | 观感 | 关键属性 |
|---|---|---|
| kwpop | 弹出 | scale .72 -> 1.14 -> 1 |
| kwblur | 从模糊里浮出 | filter blur 10px -> 0 |
| kwglow | 一次白光 | text-shadow 光晕脉冲 |
| kwstrobe | 闪两下 | opacity 0/1/.35/1 |
| kwrot | 转正 | rotate -14deg -> 0 |
| kwtrack | 字距收拢 | letter-spacing .42em -> .02em |
| kwshadow | 影子砸下来 | text-shadow 从无到实 |
| kwsquash | 挤压回弹 | scaleY 1.6 -> .94 -> 1 |
| kwdrop | 从上方落下 | translateY -26px -> 0 |
| kwshift | 色相偏移归位 | hue-rotate 70deg -> 0 |
| kwrise | 从下方升起 | translateY 18px -> 0 |
| kwkaraoke | 半透明底随词扫过 | background alpha 0 -> .16 |
| kwline | 下划线出现 | text-decoration-color 0 -> currentColor |

全部 340ms，cubic-bezier(.2,.9,.25,1)，both。

## 加一条新的

1. 在 scripts/lib/captions.mjs 的 KEYFRAMES 里加一行 [名字, 关键帧]。
2. 把名字加进 ANIM 数组（顺序决定轮转）。
3. 跑 node --check 与 koubo captions，用 openfilm look 3-6 看效果。

## 边界

- 只作用在 cue 内：cue 结束动画就结束，不能跨句。
- animation-delay 从 cue 起点算，所以同一 cue 里最多 6 个词有错峰；一行超过 6 个关键词会被压平。
- 字体与渲染由 OpenFilm 决定；transform 类动画依赖宿主对 ::cue 的支持，不支持时只剩颜色与透明度变化。


## 在 OpenFilm（Chromium）里实际生效的部分

用 Edge/Chromium 打开带 `<track default>` 的页面，逐帧截图核对，结论如下（2026-11 实测）：

| 能力 | 结果 | 说明 |
|---|---|---|
| ::cue 颜色 / 字重 / 字体 / 字号 | 生效 | 关键词 c1/c2/c3 三色都能显示，白字黑底上可读 |
| ::cue 的 text-shadow | 部分生效 | 阴影淡，深色画面上仍靠底色压住 |
| @keyframes + animation | 不生效 | 同一 cue 在 +0.04s / +0.16s / +0.44s 三帧完全一致 |
| animation-delay | 不生效 | 同上，连带 d1..d6 全部无效果 |
| cue settings（line/position/align） | 生效 | line:74% 实测落在画面 76% 居中 |

对策（已写进 SKILL.md §5）：

1. VTT 里保留 c.cN.aR.dD 的 class 结构，不删——将来 OpenFilm 换渲染器或换成支持 ::cue 动画的引擎时直接生效，现在无副作用。
2. 真正要「动」的重点，放到海报帧页面：pages/koubo-poster-NN.html 的 frame(t) 用 (t - delay) / 0.34 算位移、缩放、闪白，纯 t 决定画面，满足「同一个 t 画出同一张图」。
3. 需要逐词级别的字幕动画时，走 DSH 版（ASS + libass），不要指望 VTT。
