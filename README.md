# Pan 淘词

> 读书时拾词，闲时温故。

本地优先的英语间隔重复（SRS）。不做词书、不做账号、不上传任何数据，所有卡片都在你自己的浏览器里。

在线访问：https://joelle-dev.github.io/pan-words/

## 功能

**收词**
- 粘一段原文，自动扫出你不认识的词，显示覆盖率
- 手动加词：单词、释义、原句、来源
- **一键自动补全**：点「自动填」或按回车，自动带出音标、词性和中文释义
- 批量导入词表：Tab / 逗号 / 短横线 / 纯单词，自动识别格式

**复习**
- FSRS-5 调度，默认权重，不做个性化训练
- 三种卡型：认词、拼写、挖空（听写、回忆已留接口）
- 四档评分：忘记 / 模糊 / 记得 / 太简单
- 键盘操作：空格翻面，1–4 评分
- 系统 TTS 发音，零依赖、离线可用

**词库**
- 按状态筛选：新词 / 学习中 / 复习中 / 重学中
- 全文搜索：单词、释义、来源
- 词形归并：`run / ran / running` 视为同一个词，避免重复背
- 删除可撤销

**阅读**
- 存下来的原文可反复重读，生词随词库增长变浅
- 点击带下划线的词直接加进词库

**统计**
- 12 周复习热力图、连续天数、记忆保持率

**数据**
- IndexedDB 本地存储，离线可用
- 导出 / 导入备份（`.panbackup`）
- 深色模式

## 图标与品牌

```
public/logo.png              透明背景，App 内页头 / 页脚使用
public/logo-square.png       奶油底方形版，备用
public/icons/icon-192.png    PWA 图标（奶油底，不透明）
public/icons/icon-512.png
public/icons/icon-maskable-512.png   带安全边距的 maskable 版
public/icons/apple-touch-icon.png    iOS 主屏图标
```

换 logo 只需替换 `public/logo.png`，代码无需改动：`src/components/BrandMark.vue` 会自动读取，图片缺失时回退到内置线条图标。

**关于背景透明**：App 图标（iOS / PWA）必须不透明，透明 PNG 在 iOS 主屏会变黑底，所以图标用奶油底合成；只有 App 内的 `logo.png` 保留透明通道。

## 技术栈

Vue 3 + Vant 4 + Vue Router + Vite 5 + vite-plugin-pwa，数据存储使用 IndexedDB。

分词使用浏览器内置的 `Intl.Segmenter`，发音使用 `speechSynthesis`，不引入额外依赖。

## 本地开发

```bash
npm install
npm run dev
```

## 测试

```bash
npm test
```

测试覆盖：FSRS 调度、词形归并、分词与覆盖率、队列组装、数据层、词表解析。

## 构建与部署

```bash
npm run build:docs
```

构建结果输出到 `dist/` 并复制到 `docs/`。GitHub Pages 推荐配置：

- Source：Deploy from a branch
- Branch：`main`
- Folder：`/docs`

默认 `start_url` / `scope` 为 `/pan-words/`。仓库名不同时传入：

```bash
VITE_APP_START_URL=/你的仓库名/ VITE_APP_SCOPE=/你的仓库名/ npm run build:docs
```

## 设计边界

明确不做：内置词书、内置词典、云同步、账号、OCR、AI 例句、口语评分、推送提醒。

原因：这些都会破坏「本地优先、零服务器、零内容版权风险」这条底线，或者把工期翻倍。

### 关于在线查词

「自动填」会调用两个免费的公开 API，都是可选的，失败不影响手动输入：

- `dictionaryapi.dev`：英英释义、音标、词性（CC BY-SA 3.0）
- `mymemory.translated.net`：英译中

这两个请求会把你查的那个单词发出去。如果你完全不希望联网，可以不用「自动填」，手动填释义即可——其余功能全部离线。

## 已知的平台约束

- iOS 未添加到主屏幕时，系统可能在长期不活跃后清理站点存储。请添加到主屏幕并定期导出备份。
- iOS 不支持 Web Share Target，所以收词只能靠粘贴。
- iOS 无法可靠地做 Web 推送，提醒功能改用打开应用时的队列提示。
