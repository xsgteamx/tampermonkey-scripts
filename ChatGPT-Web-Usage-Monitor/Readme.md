# ChatGPT Codex Usage Monitor

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-UserScript-green)
![ChatGPT](https://img.shields.io/badge/ChatGPT-Web-10a37f)
![License](https://img.shields.io/badge/license-MIT-green)

一个用于 **ChatGPT Web** 的 Tampermonkey 用户脚本，在 ChatGPT 页面中直接展示 **Codex 额度的剩余比例与重置时间**。

适合经常使用 **ChatGPT Work、Codex 等高额度消耗功能** 的用户，无需频繁进入其他页面查询额度，打开 ChatGPT 即可随时查看当前 Codex 使用情况。

> 当前版本主要读取并展示 Codex 的 **5 小时窗口** 与 **7 天额度窗口**。实际可获取的数据取决于当前 ChatGPT 账号及 OpenAI Web 接口返回内容。

---

## ✨ 功能特性

* 📊 显示当前 ChatGPT 账号的 Codex 使用情况
* ⚡ 显示 **5 小时额度窗口**
* 📅 显示 **7 天额度窗口**
* 🔋 显示当前 **剩余额度百分比**
* 📉 显示当前 **已使用额度百分比**
* ⏰ 显示 **额度重置时间**
* ⌛ 显示距离下一次额度重置的剩余时间
* 🔄 定时自动刷新额度数据
* ⏱️ 本地实时更新重置倒计时，无需频繁请求接口
* 🖱️ 鼠标悬停自动展开详细信息
* ↔️ 根据悬浮窗所在位置自动判断展开方向
* 📌 支持自由拖动悬浮窗
* 💾 自动保存悬浮窗位置
* 🌙 自动适配 ChatGPT 深色 / 浅色主题
* 📱 自动适配移动端布局
* 👆 支持触屏拖拽与点击展开
* 🎨 根据额度使用程度自动切换状态颜色
* 🙈 当前账号没有 Codex 用量数据时自动隐藏面板
* 🌐 无需额外后端服务，直接运行在 ChatGPT Web 页面

---

## 🖥️ 界面效果

### 收起状态

默认情况下，悬浮窗保持紧凑显示：

```text
5小时
83%
3h 21m

──────

7天
64%
4d 7h
```

其中百分比表示当前 **剩余额度**。

例如：

```text
83%
```

表示当前额度已使用约 `17%`，剩余 `83%`。

---

### 展开状态

桌面端将鼠标移动到悬浮窗上后，会自动展开详细信息：

```text
Codex 用量监控

⚡ 5小时窗口

剩余                    83%
已用 17%          09/07 13:40
                       3h 21m

📅 7天配额

剩余                    64%
已用 36%          09/11 10:20
                        4d 7h
```

展开状态下可以同时查看：

* 剩余额度
* 已使用额度
* 具体重置时间
* 距离重置的剩余时间

---

## ↔️ 智能展开方向

悬浮窗会记录自身位于屏幕左侧还是右侧，并自动决定展开方向。

```text
位于屏幕右侧
        ← 向左展开

位于屏幕左侧
向右展开 →
```

因此把窗口拖到屏幕左边后，不会继续傻乎乎地往屏幕外展开。

拖动结束后，脚本会自动记录：

* 左 / 右停靠方向
* 距离屏幕边缘的位置
* 垂直位置

下次打开 ChatGPT 时会恢复上一次的位置。

---

## 🌙 深色 / 浅色主题

脚本会自动检测 ChatGPT 当前主题，并同步调整悬浮窗样式。

支持：

* 🌙 ChatGPT 深色模式
* ☀️ ChatGPT 浅色模式
* 🖥️ 跟随系统主题

如果 ChatGPT 页面运行过程中切换主题，悬浮窗也会实时更新，无需刷新页面。

---

## 📱 移动端支持

当浏览器宽度小于或等于 `768px` 时，脚本会自动进入移动端紧凑布局。

移动端会使用更小的悬浮窗，以减少对 ChatGPT 对话内容的遮挡。

同时支持 Pointer Events，因此可以使用：

* 鼠标拖动
* 触摸拖动
* 手写笔拖动

在触屏设备上轻点悬浮窗，还可以切换展开 / 收起状态。

---

## 🎨 额度颜色

颜色根据 **已使用额度比例** 自动变化：

| 已使用额度       | 状态 | 显示    |
| ----------- | -- | ----- |
| `< 60%`     | 正常 | 🟢 绿色 |
| `60% - 84%` | 较高 | 🟡 黄色 |
| `≥ 85%`     | 紧张 | 🔴 红色 |

也就是说，用得越狠，颜色越红。

当它变红的时候，大概是在非常委婉地提醒你：

> 今天是不是该少点两次 Work 了。

---

## 🔄 数据刷新机制

脚本启动后会立即请求一次最新额度数据。

随后默认每：

```text
65 秒
```

重新请求一次 ChatGPT 的额度接口。

重置倒计时并不会跟着每次请求接口，而是单独在浏览器本地每：

```text
30 秒
```

更新一次。

因此：

```text
额度数据     → 约每 65 秒向服务器刷新
倒计时显示   → 每 30 秒在本地更新
```

这样既能保持数据显示及时，也避免为了一个倒计时疯狂请求服务器。

---

## 📦 安装

### 1. 安装用户脚本管理器

推荐使用：

* Tampermonkey
* Violentmonkey

支持 Chrome、Edge、Firefox 等主流浏览器。

---

### 2. 创建用户脚本

打开 Tampermonkey：

```text
Tampermonkey
→ 添加新脚本
→ 删除默认内容
→ 粘贴本项目的 .user.js 文件
→ 保存
```

---

### 3. 打开 ChatGPT

访问：

```text
https://chatgpt.com/
```

登录 ChatGPT 后，脚本会自动启动。

同时兼容：

```text
https://chat.openai.com/
```

成功获取额度数据后，Codex 用量悬浮窗会自动出现。

---

## 🙈 为什么没有显示悬浮窗？

新版脚本采用：

> **有有效 Codex 数据才显示。**

因此如果当前账号：

* 没有登录 ChatGPT
* 没有 Codex 使用权限
* 当前账号没有 Codex Usage 数据
* ChatGPT 暂时没有返回有效额度信息

悬浮窗可能不会显示。

如果接口明确返回当前账号不存在 Codex 用量信息，脚本会自动：

```text
隐藏悬浮窗
+
停止后续额度轮询
```

避免在页面上长期挂一个没有任何作用的空窗口。

---

## 🔐 隐私与安全

脚本直接运行在当前浏览器中的 ChatGPT 页面。

额度数据通过当前已经登录的 ChatGPT Session 获取，并请求 ChatGPT Web 自身使用的额度接口。

脚本：

* 不要求输入 OpenAI API Key
* 不要求手动填写 Access Token
* 不需要额外服务器
* 不需要第三方 API
* 不会主动将额度数据上传到第三方服务

Access Token 仅从当前 ChatGPT 登录 Session 中读取并用于请求 ChatGPT 自身接口。

脚本还会缓存短时间内取得的 Session Token，避免无意义地频繁重复请求 Session 接口。

---

## 🛠️ 工作原理

脚本首先使用当前 ChatGPT 登录状态访问：

```text
/api/auth/session
```

获取当前 Web Session 对应的 Access Token。

随后尝试访问：

```text
/backend-api/wham/usage
/backend-api/codex/usage
```

获取 Codex 的 Rate Limit 数据。

脚本兼容以下字段形式：

```text
primary_window
secondary_window
```

以及：

```text
primary
secondary
```

其中通常对应：

```text
primary   → 5 小时窗口
secondary → 7 天窗口
```

脚本读取：

```text
used_percent
reset_at
reset_after_seconds
```

然后计算：

```text
剩余额度 = 100% - 已使用额度
```

最终在 ChatGPT 页面展示：

```text
5 小时剩余额度
5 小时已使用额度
5 小时重置时间

7 天剩余额度
7 天已使用额度
7 天重置时间
```

---

## 🧩 接口兼容策略

脚本会依次尝试：

```text
/backend-api/wham/usage
/backend-api/codex/usage
```

如果其中一个接口返回 `404`，会继续尝试下一个接口。

这样可以一定程度兼容 ChatGPT Web 不同阶段使用的额度接口路径。

---

## 🖱️ 悬浮窗位置

默认位置：

```text
屏幕右侧：20px
屏幕顶部：90px
```

拖动悬浮窗后，位置会保存在浏览器的：

```text
localStorage
```

保存 Key：

```text
codex-usage-position
```

页面尺寸发生变化时，脚本会重新检查窗口位置，避免悬浮窗因为调整浏览器大小而跑出屏幕。

---

## 🌐 支持页面

当前脚本匹配：

```text
https://chatgpt.com/*
https://chat.openai.com/*
```

---

## ⚠️ 注意事项

本项目为 **非官方用户脚本**，与 OpenAI 无关联。

脚本依赖 ChatGPT Web 当前使用的内部接口，因此如果 OpenAI 修改以下内容：

* ChatGPT Web API
* Session 获取方式
* Codex Usage API
* Rate Limit 数据结构
* 接口权限
* 额度计算方式

脚本可能暂时无法正常工作，需要同步更新。

不同 ChatGPT 套餐、账号以及功能开放状态下，可获取到的额度信息也可能存在差异。

---

## 📌 当前版本

```text
Version 3.0.0
```

### 3.0.0

主要特性：

* 自动判断悬浮窗展开方向
* 支持 ChatGPT 深色 / 浅色主题
* 移动端紧凑布局
* 支持触屏拖拽
* 触屏点击展开 / 收起
* 本地实时更新额度重置倒计时
* 悬浮窗位置持久化
* 浏览器尺寸变化自动修正位置
* 无 Codex 数据自动隐藏
* 无 Codex 数据时停止无意义轮询
* 对 Usage API 提供双接口兼容

---

## 📄 License

MIT License

---

## 💡 项目说明

这个脚本的目标很简单：

> **让 ChatGPT Codex 的额度变得可见。**

特别是在频繁使用 **ChatGPT Work、Codex** 等额度消耗较高的功能时，可以直接在 ChatGPT Web 页面看到剩余额度以及下一次重置时间。

不用等 ChatGPT 突然告诉你额度没了，才开始回忆自己今天究竟干了什么。

至少现在，你可以亲眼看着它一点一点消失。
