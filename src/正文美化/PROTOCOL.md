# 正文美化协议约定（角色色 / 表情差分）

## 对白

```text
{角色标准全名}「台词」
{角色标准全名}(情绪词)「台词」
```

- 花括号内仅简体中文标准全名。
- `(情绪词)` 可选；也支持全角 `（情绪词）`。
- 情绪词是图库键（建议 ≤12 字），**不要翻译**；匹配失败回退默认头像。

## 内心话

```text
<inner_voice name="角色名" mood="情绪词">
第一人称内心话
</inner_voice>
```

- 优先 `name`；旧 `role=` 仍兼容。
- `mood` 可选，与对白共用情绪词表；图库 title 为 `表情 ${情绪词}`；省略则走默认头像链。
- 不必再写 `<p style="color:...">`；颜色由脚本按档案主题色处理。
- 协议文档里的 `${...}` 只是占位说明，模型应直接写正文。

## 角色 EJS（char-info-ejs-builder v2）

在 `profile` 中增加：

```js
roleColor: "#RRGGBB",
gallery: [
  { title: "主立绘", sources: ["https://files.catbox.moe/xxx.png"] },
  { title: "表情 微笑", sources: ["https://files.catbox.moe/yyy.png"] },
]
```

写入 `setLocalVar` 时：

```js
...(profile.roleColor ? { role_color: profile.roleColor } : {}),
...(profile.raceColor ? { custom_racecolor: profile.raceColor } : {}),
```

- 正文美化读：`getVariables({ type: 'chat' }).char_info.profiles[名]`
- 颜色优先 `role_color`，否则软回退 `custom_racecolor`
- 头像：`(mood)` → `表情 ${mood}` → 状态栏/`externalAvatars` → `主立绘` → 首字
- 主立绘勿用 mp4/webm 当头像源（脚本会跳过视频）
