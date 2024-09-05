# Sync-Writer

专为非英语母语者设计的 $\LaTeX$ 写作工具，**只需编写非英语的文本注释，即可自动同步生成符合英语学术写作规范的 $\LaTeX$ 文本**。

- 自动翻译为符合英语学术写作规范的 $\LaTeX$ 文本；
- 注释和正文之间保持同步，无论编辑哪一方，另一方都会自动更新；
- 增量翻译，内容更新时翻译文本将参考上一次的翻译结果，保证用词、风格的一致性；
- 支持术语定义，确保同一篇文档中术语的一致性；
- 支持自动记录写作偏好，确保同一篇文档中的风格的一致性。

# 添加同步块

同步块分为两个部分，即**源语言部分**和**目标语言部分**。源语言部分是以使用者母语书写的文本，需要写在以`%sync` 开头的注释中；目标语言部分是根据源语言部分自动生成的符合英语学术写作规范的 $\LaTeX$ 文本。

添加 `%sync` 开头的注释（当输入 `sync` 后，将会有 snippet 提示）即创建了同步块中的源语言部分，与其相对应的目标语言部分默认为换行后的下一行文本：

```diff
%sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，以其麻辣鲜香而著称。

+ Bowl chicken is a special delicacy in Meishan, Sichuan, known for its spicy and fragrant taste.
```

当编辑注释时：

```diff
- %sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，以其麻辣鲜香而著称。
+ %sync>1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，1990年代起在四川省内外广受欢迎。

Bowl chicken is a special delicacy in Meishan, Sichuan, known for its spicy and fragrant taste.
```

正文会自动更新：

```diff
%sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，1990年代起在四川省内外广受欢迎。

+ Bowl chicken is a special delicacy in Meishan, Sichuan, which has been popular in and out of Sichuan Province since the 1990s.
```

当你觉得翻译结果有需要改进的地方时，可直接对正文进行编辑：

```diff
%sync<1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，1990年代起在四川省内外广受欢迎。

- Bowl chicken is a special delicacy in Meishan, Sichuan, which has been popular in and out of Sichuan Province since the 1990s.
+ Bowl chicken is a special delicacy in Meishan, Sichuan. It has been popular in and out of Sichuan Province since the 1990s.
```

随后，注释也会自动更新：

```diff
- %sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，1990年代起在四川省内外广受欢迎。
+ %sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食。自1990年代以来，它在四川省内外广受欢迎。

Bowl chicken is a special delicacy in Meishan, Sichuan. It has been popular in and out of Sichuan Province since the 1990s.
```

**⚠️ 注意**：请不要修改同步块的前缀（如上例中的 `%sync|1a2b3c `），否则同步将会失效。

# 逐句翻译

为了避免过于频繁的触发同步，默认在每次输入完整的句子后（以句号、问号或分号作为结尾）才会触发同步。

- 如果你想要手动触发同步，可以使用 `Ctrl+Shift+S` 快捷键。
- 如果你不喜欢自动触发同步，可以在配置文件中关闭这个功能。

# 增量同步

当对同步块中的内容进行编辑后，下一次同步将参考上一次的翻译结果，保证用词、风格的一致性。

比如，当你编辑了同步块中的源语言部分：

```diff
- %sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，1990年代起在四川省内外广受欢迎。
+ %sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食。自1990年代以来，它在四川省内外广受欢迎。

Bowl chicken is a special delicacy in Meishan, Sichuan, known for its spicy and fragrant taste.
```

在翻译时，LLM 实际看到的是：

```markdown
# Previous Translation

Source: 钵钵鸡是一种四川眉山一带的特色美食，1990 年代起在四川省内外广受欢迎。

Translation: Bowl chicken is a special delicacy in Meishan, Sichuan, known for its spicy and fragrant taste.

# Current Translation

Source: 钵钵鸡是一种四川眉山一带的特色美食。自 1990 年代以来，它在四川省内外广受欢迎。

Translation:
```

因此，大部分没有改变的内容都会保持与上一次同步时的翻译结果完全一致，只会重新翻译新增/修改的部分。

# 同步块操作

在每一个同步块上都会展示若干**同步块操作**，根据同步块所处的状态不同，会有不同的操作：

![alt text](assets/synced.png)

- 已同步（`Synced`）：
  - 源语言部分的 `resync`：重新翻译源语言部分；
  - 目标语言部分的 `resync`：重新翻译源语言部分；

![alt text](assets/editing.png)

- 编辑中（`Editing`）：
  - 同步（`Sync`）：手动触发同步；

![alt text](assets/syncing.png)

- 同步中（`Syncing`）：
  - 取消同步（`Abort`）：取消同步操作并回滚到上一次的同步结果；

# 配置文件

配置文件默认放在当前打开工作区根目录下的 `sync-writer.json` 文件中。

```json
{
  "references": {
    "glossary": [
      { "source": "钵钵鸡", "target": "Bowl chicken" },
      { "source": "麻辣鲜香", "target": "spicy and fragrant" }
    ],
    "preferences": [
      { "source": "我们强调了", "target": "we emphasized" },
      { "source": "我们提出了", "target": "we proposed" }
    ]
  }
}
```

## 术语定义

你可以预先定义一些术语，确保同一篇文档中术语的一致性。在翻译过程中，如果遇到了已经定义的术语，LLM 将会尽量采用你所规定的翻译。

## 写作偏好记录 （TODO）

与 ChatGPT 网页版的 Memory 功能类似，Sync-Writer 会自动记录你的写作偏好，确保同一篇文档中的风格的一致性。

比如，当你多次使用 `Bobo-Chicken`，而不是 `Bowl chicken` 时，Sync-Writer 会自动记录你的偏好：

```diff
%sync|1a2b3c 钵钵鸡是一种四川眉山一带的特色美食，1990年代起在四川省内外广受欢迎。

- Bowl chicken is a special delicacy in Meishan, Sichuan. It has been popular in and out of Sichuan Province since the 1990s.
+ Bobo-Chicken is a special delicacy in Meishan, Sichuan. It has been popular in and out of Sichuan Province since the 1990s.
```

与术语定义类似，所有自动记录的写作偏好都可以在 `sync-writer.json` 中找到，你也可以手动编辑这个文件。
