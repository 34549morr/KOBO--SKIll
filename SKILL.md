---
name: koubo-editor
description: 把一篇口播稿剪成 OpenFilm 竖屏成片：断句分行、认重点、按语速定时、生成带逐词动画的 WebVTT 字幕轨、每 8-12 秒生成一张层级排版海报帧、配 whoosh/impact/riser 音效，并检查覆盖率/海报间隔/响度。要「把稿子剪成口播视频」「给口播配字幕和重点动画」「做海报帧/层级排版」「批量做口播」时使用。
---

# 口播剪辑（OpenFilm 版）

稿子进、成片出。所有默认数字都来自六条真实抖音口播片的逐帧测量（见 references/rules.md），不是拍脑袋。

> 规则真源在 DSH 版：C:/Users/34549/.dsh/skills/koubo-editor/templates/style.json。
> 改参数先改那边，再运行 openfilm koubo sync；不要只改这里的 style.json。

## 0. 先建项目，再决定有没有人像

    openfilm koubo init --project <项目> --width 1080 --height 1920
    openfilm koubo plan script.txt --project <项目> --voice voice.wav --profile finance --theme auto

- 有人像素材：把 video 放在最上面的 section，只用 #t= 裁时间，不重编码；字幕与海报帧都是叠在它上面的轨。
- 没有人像：先用 film 技能做底（纯色/渐变/素材），再加字幕与海报帧。不要用编造的人脸填画面。
- 旁白可以是 .wav（直接读头）或任何 ffprobe 读得到的文件；给了 --voice 时全片时长按它缩放，字幕与画面对齐。

## 1. 六步

| 步 | 命令 | 产物 | 说明 |
|---|---|---|---|
| 1 | koubo init | film.html（无则建） | 1080x1920 画布写在 meta viewport |
| 2 | koubo plan | koubo/plan.json | 断句、分行（≤12 字）、关键词与等级、主题色板、时间 |
| 3 | koubo captions | koubo/captions.vtt + caption 轨 | 一行一 cue，关键词裹 c.cN.aR.dD；染色实测生效，动画见 §5 |
| 4 | koubo pages | pages/koubo-poster-NN.html + iframe 轨 | 每个 L3 一张海报帧，stack 与 corner 交替 |
| 5 | koubo sfx | assets/sfx/*.wav + audio 轨 | whoosh/impact/riser/tick，按事件与行首摆位 |
| 6 | koubo check | JSON 报告 | 覆盖率、行数、颜色数、海报间隔、响度；有 warning 退出码 1 |

排完顺序再 openfilm look / look --full 看画面，最后 openfilm render（或 Studio 导出）。

## 2. 排版规则（不要改，除非先改 style.json 再 sync）

- 字幕 54px @1920（画高 2.8%），白字 + 2px 暗描边，基线 73.5% 画高；一行一句，1.0-1.6 秒换一行。
- 同一行最多 3 种字色；关键词按角色取主题色：数字=金、判词=红、概念=青、专名=紫。同角色撞色时换下一个色。
- 关键词按角色染色；VTT 里仍写着 13 条进场动画的 class（无副作用），但 Chromium 会忽略 ::cue 上的 @keyframes，所以本机实际只看到颜色，看不到动画（实测，见 references/caption-animation.md）。
- 重点的「动」放在海报帧页面里：main 逐帧由 t 驱动（位移 + 缩放 + 闪白），这是目前唯一能真的动起来的一层。
- 海报帧每 8-12 秒一张（typography.poster_every_s=8），放在最强转折句上；两种版式交替：stack（kicker + 大主体 + 副题 + 双细线）与 corner（居中主体 + 四角标签 + 短线）。
- 海报帧是页面（可以画字），字幕是 caption 轨（永远不在页面里画字）。
- 图层顺序：film.html 里第一条 section 在最上层。koubo pages 会把海报帧 section 自动放到 body 最前面（压在素材之上），手工搬运素材时不要打乱这个顺序。
- 海报帧页面只活在自己的 dur 里（默认 1.4-2.6 秒），结尾 0.28 秒淡出；开始有 0.18 秒的柔光闪白（alpha 0.40）。
- 四层信息：底字（cue）/ 重点词（彩色 + 动画）/ 框架概要（海报帧的 kicker 与副题）/ 关键词（四角标签）。同屏不要超过两层。

## 3. 节奏与声音

- 切点密度 24 次/分（2.5 秒一切）是六片均值；信息密集段可到 27，论证段降到 9-17。
- 单镜不超过 3.4 秒；静帧也要有运动（页面里的 CSS 动画或 film.html 的 keyframes）。
- 音效只四件：whoosh（进）、impact（重音）、riser（起势）、tick（行首）。音量 0.12-0.34，宁轻不重。
- 人声响度目标 -16..-14 LUFS；BGM 在 -30dB 左右垫底，不能盖住字。

## 4. 检查门槛

    openfilm koubo check --project <项目>

- captions.coverage ≥ 0.85；cues 数 = 行数；maxColors ≤ 3；longest ≤ 16 字。
- posters ≥ 1，posterGap ≤ 14 秒。
- sfx ≥ 1；voiceLufs 在 -22..-10 之外会告警。
- 另外跑 openfilm look --full：查闪白、跳帧、静帧、黑场；渲染前用 look 3-6 看具体区间。
- look / render 只能在 OpenFilm 应用内跑：外部命令行会在加载 vision-assets 时报 Cannot find module @mediapipe/tasks-vision（依赖打在 app.asar 里）。

## 5. 做不到的事（如实说）

- 蒙版、复合片段、抠像（文字压在人物身后）需要人像分割与 NLE 图层，这套命令不做；需要时给 Studio 手工步骤。
- 逐词动画在 Chromium 里不生效：::cue 的颜色、字重、字体、字号都能用，@keyframes / animation 被忽略（用 Edge/Chromium 截图逐帧比对确认）；VTT 规范里没有给单个词加内联样式的办法。要更强的逐字节奏只能把整句做成页面，但那违反「字幕不进页面」的规矩，所以这里不做。
- 字幕实测落在画面 76% 高度居中（line:74% 会被 Chromium 往下推 2%），仍在安全区内。
- caption 的字体渲染由 OpenFilm 决定；缺字体时先装 Microsoft YaHei 或 Noto Sans SC。
- 网络素材受站点许可与 429 限制；没有可用素材时用页面/图形，不要假装有实拍。

## 6. 与 DSH 版同步

- DSH 版：C:/Users/34549/.dsh/skills/koubo-editor（Python/ffmpeg，ASS 渲染）。
- 这里的 templates/style.json 由 openfilm koubo sync 从 DSH 版复制；sync --check 返回非 0 表示漂移。
- 对齐做法：DSH 版负责 Python/ASS 的完整能力（逐词动画在 libass 里真的会动），OpenFilm 版负责工程结构、海报帧页面与字幕轨；两边共用同一份 style.json，所以节奏、字号、配色、海报间隔不会各说各话。
- 规则改动顺序：改 DSH style.json 或 SKILL.md → sync → 回归 plan 与 captions 两条命令 → 更新 references/rules.md 的数字。
