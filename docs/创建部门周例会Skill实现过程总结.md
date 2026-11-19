# "创建部门周例会" Skill 实现过程总结

## 一、项目概述

### 1.1 目标

在新点 OA 系统（oa.epoint.com.cn）中自动化创建"研发4部-1组周例会"，完成从打开会议看板到填写会议信息、选择参会人员、添加议题并保存草稿的全流程。

### 1.2 技术背景

- **目标系统**: 新点 OA 系统（oa.epoint.com.cn）
- **前端框架**: mini-ui（jQuery 类组件库），表单数据使用 `commonDto` 编码
- **自动化方案**: Tampermonkey 油猴脚本（UI 模拟操作）
- **技术选型原因**: 表单使用动态 `_dialogId_` 和 `_winid` 参数，人员选择涉及 iframe 和树形组件，API 逆向成本过高

### 1.3 录制数据概要

| 项目 | 值 |
|------|-----|
| 起始页面 | https://oa.epoint.com.cn/epointoa9/frame/fui/pages/themes/aide/aide?pageId=aide |
| 录制时长 | 158 秒 |
| XHR/Fetch 调用数 | 18 |
| 用户操作数 | 64 |

---

## 二、Skill 生成阶段

### 2.1 录制数据分析

通过读取 `monitor-03474f9f-4505-45bf-a289-a6564e07c28c-1789614272724-compact.json` 分析用户的操作流程：

**关键操作步骤：**

1. 点击"我的会议"图标 → 进入会议看板
2. 点击"新增会议"按钮 → 打开会议管理-新增对话框
3. 填写会议名称 → "会议名称：研发4部-1组周例会-2026年第28期-0924"
4. 点击会议类型 checkbox 区域
5. 选择"线下会议室（公司）"
6. 填写腾讯会议链接（会议室信息）
7. 点击"选择用户"按钮 → 打开人员选择对话框
8. 勾选 9 位参会人员（通过 `mini-6$checkbox$N`）
9. 点击"确定选择"按钮
10. 点击"新增议题"按钮
11. 填写议题名称和内容
12. 点击"保存议题"按钮
13. 点击"保存草稿"按钮

### 2.2 关键 API 识别

| API 端点 | Method | 用途 |
|----------|--------|------|
| `/yskmanage/rest/meetingreserverest/getmeetingbasicinfoboard` | POST | 获取会议看板日历数据 |
| `/yskmanage/rest/frame/pages/meeting/meetingbasicinfoaddaction/page_load` | POST | 加载新增会议表单 |
| `/yskmanage/rest/frame/pages/meeting/meetingbasicinfoaddaction/add` | POST | 保存会议基本信息 |
| `/yskmanage/rest/framemanager/orga/orga/user/selectgroupbyuseraction/page_load` | POST | 加载人员选择对话框 |
| `/yskmanage/rest/framemanager/orga/orga/user/selectgroupbyuseraction/getTreeOuModel` | POST | 获取人员树并勾选 |
| `/yskmanage/rest/frame/pages/meeting/meetingtopicinfoeditaction/page_load` | POST | 加载议题编辑表单 |
| `/yskmanage/rest/frame/pages/meeting/meetingtopicinfoeditaction/save` | POST | 保存议题 |
| `/yskmanage/rest/frame/pages/meeting/meetingbasicinfoaddaction/saveForm` | POST | 保存草稿 |

### 2.3 技术验证阶段

在实现完整功能脚本之前开发了技术验证脚本（`oa-weekly-meeting-validator.user.js`），用于：
1. 验证油猴脚本能否正确注入 OA 页面
2. 确认 CSS 选择器能否定位到目标元素
3. 验证点击交互能否触发页面导航
4. 输出页面结构信息（按钮、图标、iframe 列表），为完整脚本提供 DOM 参考

验证脚本采用**手动触发**模式（不自动执行），避免在 OA 页面上产生副作用。自 v0.2.0 起支持重试机制和分级日志。

### 2.4 自动化策略选择

由于该 OA 系统的复杂性（mini-ui 框架、commonDto 编码、动态 dialogId、多步关联操作），最终选择 **UI 模拟操作** 策略，原因：

1. 表单数据使用 `commonDto` 特殊编码格式，需要大量逆向工程
2. 动态生成的 `_dialogId_` 和 `_winid` 参数难以预测
3. 人员选择涉及 iframe 交互，状态管理复杂
4. UI 模拟可以忠实还原用户操作，维护成本低

---

## 三、测试阶段问题与解决

### 3.1 PowerShell JSON 转义问题

#### 问题描述

在 PowerShell 中执行 `paw browser-action` 时，JSON 参数传递遇到多种错误：

```
Error: {"success":false,"error":"Invalid JSON command: {action:navigate,url:...}"}
Error: error: too many arguments for 'browser-action'. Expected 1 argument but got 15
```

#### 原因分析

- PowerShell 对双引号字符串中的内容进行变量展开和转义处理
- `cmd /c` 调用时，空格和特殊字符会导致参数被错误分割
- JSON 中的逗号被 PowerShell 解析为参数分隔符

#### 解决方案

使用 PowerShell 的 `&` 调用运算符 + 反引号转义模式：

```powershell
& "$env:USERPROFILE\.meituan-catpaw\bin\paw.cmd" browser-action "{\`"action\`":\`"evaluate\`",\`"script\`":\`"...\`"}"
```

**关键技巧：**
- 使用 `&` 调用运算符直接执行命令，避免 `cmd /c` 的二次解析
- 使用反引号 `` ` `` 转义双引号 `\"`
- JavaScript 脚本中使用单引号，避免与 JSON 双引号冲突
- 避免在脚本中使用逗号（如 `Array.from`、`forEach` 回调参数）

#### 最终成功模式

```powershell
& "$env:USERPROFILE\.meituan-catpaw\bin\paw.cmd" browser-action "{\`"action\`":\`"evaluate\`",\`"script\`":\`"var fd=document.getElementsByTagName('iframe')[0].contentDocument;...\`"}"
```

---

### 3.2 人员选择 iframe 访问问题

#### 问题描述

人员选择对话框使用 mini-ui 树形组件渲染，直接导航到 `selectusermulti` 页面显示"共 0 条"，无法获取人员列表数据。

#### 原因分析

人员选择对话框的 HTML 结构：
- 主文档包含一个 `<iframe>`，src 指向 `selectusermulti` 页面
- 树形组件在 iframe 内部渲染
- 直接导航到 iframe URL 会丢失 OA 门户框架的上下文，导致数据无法加载

#### 解决方案

通过主文档的 `evaluate` 访问 iframe 的 `contentDocument`：

```javascript
// 访问人员选择 iframe
var fd = document.getElementsByTagName('iframe')[0].contentDocument;

// 遍历所有树节点，找到目标人员并勾选
var nodes = fd.querySelectorAll('.mini-tree-nodetext');
var targets = ['戴科','黄赟博','徐灵杰','左惠','曹俞澄','周胜宇','杨世杰','杨赛','周志银'];
for (var i = 0; i < nodes.length; i++) {
  var name = nodes[i].textContent.trim();
  if (targets.indexOf(name) >= 0) {
    var row = nodes[i].closest('tr');
    var cb = row.querySelector('.mini-tree-checkbox');
    if (cb) cb.click();
  }
}
```

#### 勾选确定按钮

```javascript
document.getElementsByTagName('iframe')[0].contentDocument.getElementById('addClose').click();
```

---

### 3.3 杨赛遗漏勾选问题

#### 问题描述

第一次批量勾选后，选择框显示 7 人（黄赟博;徐灵杰;左惠;曹俞澄;周胜宇;杨世杰;周志银），缺少杨赛。

#### 原因分析

由于 PowerShell 引号转义问题，脚本在传递过程中被截断或解析错误，导致杨赛对应的 checkbox 未被点击。

#### 解决方案

重新打开人员选择对话框，单独点击 `mini-6$checkbox$14`（杨赛对应的 checkbox ID）。

---

### 3.4 会议名称验证失败

#### 问题描述

点击"新增议题"时弹出错误提示："会议名称验证失败：会议名称不能为空！"

#### 原因分析

在操作过程中，会议名称字段可能被意外清空（如点击其他区域触发的 change 事件）。

#### 解决方案

1. 点击"确定"关闭错误提示
2. 重新点击会议名称输入框
3. 输入完整的会议名称
4. 触发 change 事件

---

### 3.5 会议室复选框验证问题

#### 问题描述

点击"新增议题"时弹出错误提示："公司会议室验证失败：公司会议室不能为空！"

即使在快照中执行了 `check` 操作并返回 `checked` 状态，验证仍然失败。

#### 原因分析

- OA 系统使用 mini-ui 的复合 checkbox 组件，不是原生 HTML checkbox
- 快照中显示 `checked=false`，因为 mini-ui 使用 CSS 模拟复选框状态
- `check` 操作只修改了 DOM 属性，没有触发 mini-ui 组件的事件处理函数
- 表单验证依赖 mini-ui 组件的内部状态，而不是 DOM 属性

#### 解决方案

使用 `evaluate` 操作主文档中的真实 `<input type="checkbox">` 元素：

```javascript
// 点击主文档中的第一个 checkbox 来切换
document.querySelectorAll('input[type=checkbox]')[0].click();
```

**关键发现：**
- 会议室类型选择区域使用 mini-ui 复合组件
- 组件内部包含一个真正的 `<input type="checkbox">` 元素
- 点击这个真实 input 元素可以正确触发状态变化

---

### 3.6 其他会议室字段验证问题

#### 问题描述

在选择"线下会议室（非公司）"时，弹出错误提示："其他会议室验证失败：其他会议室不能为空！"

同时页面显示文本框："非公司会议室，请输入..."

#### 原因分析

在会议室类型复选框区域点击时，误操作展开了"非公司会议室"对应的文本输入框，导致表单认为选择了非公司会议室。

#### 解决方案

1. 确认当前会议室类型选择状态
2. 如果"非公司会议室"文本框被意外展开，填写为"研发4部-1组会议室"
3. 或者重新勾选"线下会议室（公司）"确保状态正确

---

## 四、最终成功操作流程

### 4.1 完整步骤

1. **导航到 OA 主页**
   ```
   navigate → https://oa.epoint.com.cn/epointoa9/frame/fui/pages/themes/aide/aide?pageId=aide
   ```

2. **进入会议看板**
   - 点击顶部菜单中的"我的会议"图标

3. **点击"新增会议"按钮**
   - 打开会议管理-新增对话框

4. **填写会议名称**
   - 格式：`会议名称：研发4部-1组周例会-2026年第38期-0917`
   - 期数 = 当前日期是该年的第几周
   - MMDD = 当前月份和日期

5. **勾选会议室**
   - 使用 evaluate 点击主文档中的 checkbox：
   ```javascript
   document.querySelectorAll('input[type=checkbox]')[0].click();
   ```

6. **选择参会人员**
   - 点击"选择用户"按钮
   - 使用 evaluate 在 iframe 中勾选 9 位成员
   - 点击"确定选择"按钮

7. **新增议题**
   - 点击"新增议题"按钮
   - 填写议题名称："本周工作进展同步"
   - 填写议题内容："本周工作进展同步"
   - 点击"保存议题"按钮

8. **保存草稿**
   - 点击"保存草稿"按钮
   - 点击"确定"关闭保存成功提示

### 4.2 验证结果

- 页面显示"保存成功！"
- 会议草稿已成功保存到 OA 系统

---

## 五、关键发现总结

### 5.1 技术要点

| 问题 | 解决措施 |
|------|----------|
| **菜单默认折叠** | 左侧菜单默认收起，必须先点击 `#menu-btn` 展开，再点 `.modicon-1` |
| mini-ui checkbox | 操作真实 `<input>` 元素而非 CSS 模拟组件 |
| 页面标题变化 | 点击"我的会议"后标题**确实**"会议看板"，这是独立页面导航 |
| 人员选择对话框 | 在不同 iframe 中渲染，需回退查找 |
| 脚本重复执行 | GM_setValue 互斥锁 + `lockTimeout` 超时自动清理 |
| 会议室类型选择 | 直接操作主文档 `input[type="checkbox"]`，绕过 mini-ui 外观组件 |

### 5.2 mini-ui 组件交互模式

1. **复选框（Checkbox）**: 需要点击内部的 `<input type="checkbox">` 真实元素
2. **树形组件（Tree）**: 使用 `.mini-tree-nodetext` 定位节点文本
3. **树形复选框**: 使用 `.mini-tree-checkbox` 定位复选框
4. **按钮**: 可以直接通过 `getElementById` 或 `textContent` 定位

### 5.3 脚本安全机制

| 机制 | 说明 | 配置项 |
|------|------|--------|
| 自动执行开关 | 控制是否页面加载即执行 | `CONFIG.autoRun`（默认 false） |
| 并发执行锁 | 防止脚本重复触发 | `GM_setValue('oa_running')` |
| 锁超时清理 | 异常退出后自动释放锁 | `CONFIG.lockTimeout`（默认 120s） |
| 步骤自动重试 | 单个步骤失败自动重试 | `CONFIG.timing.maxRetries`（默认 3 次） |

---

## 六、项目文件结构

```
技能录制/
├── oa-weekly-meeting.user.js                    # 完整功能脚本（v1.1.0）
├── oa-weekly-meeting-validator.user.js           # 技术验证脚本（v0.2.0）
├── OA周例会自动化-实现方案.md                      # 技术方案文档
├── OA周例会自动化-测试指南.md                      # 详细测试用例文档
├── OA周例会自动化-人工测试验证指南.md               # 人工验证流程文档
└── 创建部门周例会Skill实现过程总结.md              # 本文档
```

### 完整功能脚本（v1.1.0）核心结构

```javascript
CONFIG              // 配置中心（autoRun, participants, selectors, timing）
Logger              // 日志系统（分级输出）
工具函数
  ├── getISOWeekNumber()     // ISO 周数计算
  ├── generateMeetingName()  // 会议名称生成
  ├── waitFor()              // 固定延时
  ├── waitForElement()       // 轮询等待元素
  ├── waitForElementGone()   // 等待元素消失
  ├── waitForTitle()         // 等待标题变化
  ├── safeClick()            // 安全点击（含 scrollIntoView）
  ├── safeInput()            // 安全输入（触发多事件）
  ├── isOnLoginPage()        // 登录页检测
  └── findUserNode()         // 人员节点查找（含 iframe 回退）
步骤实现
  ├── step1_verifyPageLoad()      // 验证页面加载
  ├── step2_openMeetingBoard()    // 打开会议看板
  ├── step3_clickAddMeeting()     // 点击新增会议
  ├── step4_fillMeetingInfo()     // 填写会议信息（含会议室类型）
  ├── step5_selectParticipants()  // 选择参会人员（含 iframe 支持）
  ├── step6_addAgenda()           // 新增议题（含结果验证）
  └── step7_saveDraft()           // 保存草稿
TaskScheduler       // 任务调度器（含重试机制）
main()              // 主流程（autoRun/手动触发 + 锁管理）
```

---

## 七、常用参会人员列表

| 姓名 | User GUID |
|------|-----------|
| 戴科 | e92eb9b1-975a-447a-b3c4-2e61b67d443d |
| 黄赟博 | 2894e5ad-241b-49de-bc2e-cd106f94675d |
| 徐灵杰 | 8dcd74d1-3609-4396-8c03-3a0513a64b5e |
| 左惠 | f811788d-df39-4123-b128-9314dc342c4e |
| 曹倢澄 | 99d6612e-0a28-41c8-879a-187596b0534a |
| 周胜宇 | 22f13352-7505-4df3-86d9-53fc81e176c5 |
| 杨世杰 | bba2487c-03c2-4d02-ab78-cea80c43b7f6 |
| 周志银 | bec8b4ae-ab17-4f43-a840-dd8ecd744461 |
| 杨赛 | 81b759d6-2441-4f7f-aa5b-3d63a5e65a73 |

---

## 八、版本历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-09-17 | 技术验证脚本初版，验证页面检测和元素定位可行性 |
| v0.2.0 | 2026-09-17 | 验证脚本增加重试机制、分级日志、手动触发模式 |
| v1.0.0 | 2026-09-17 | 完整功能脚本初版，实现 7 步自动化流程 |
| v1.1.0 | 2026-09-17 | 增加 autoRun 开关、锁超时清理、iframe 回退、议题保存验证 |
| v1.1.1 | 2026-09-17 | 修复核心 BUG：步骤 2 先点 #menu-btn 展开菜单，再点 .modicon-1 |

### 生成的文件

| 文件 | 说明 |
|------|------|
| `oa-weekly-meeting.user.js` | 完整功能油猴脚本（v1.1.0） |
| `oa-weekly-meeting-validator.user.js` | 技术验证脚本（v0.2.0） |
| `OA周例会自动化-实现方案.md` | 技术方案文档 |
| `OA周例会自动化-测试指南.md` | 测试用例文档 |
| `OA周例会自动化-人工测试验证指南.md` | 人工验证流程文档 |
| `创建部门周例会Skill实现过程总结.md` | 本文档 |

### 验证状态

- [x] 技术验证脚本通过
- [x] 完整功能脚本框架完成
- [x] 测试脚本执行成功
- [x] 会议草稿保存成功
- [x] 所有已知问题已记录并解决
- [x] 文档已更新

---

## 九、后续优化建议

### 已完成（v1.1.0）

- [x] 参会人员列表可配置（修改 CONFIG.participants）
- [x] 自动重试机制（TaskScheduler 内置 maxRetries）
- [x] 分级日志输出（DEBUG/INFO/WARN/ERROR 四级）
- [x] 安全执行机制（autoRun 开关 + 锁 + 锁超时）

### 待优化（候选）

1. **配置面板**: 通过图形界面修改参会人员列表，避免编辑脚本源码
   - 实现方案：使用 GM_registerMenuCommand 注册配置对话框，数据保存到 GM_setValue
2. **API 方式**: 研究直接调用 OA 内部 API，提高执行效率和可靠性
   - 需要逆向 `commonDto` 编码和动态参数生成逻辑
3. **多部门适配**: 将会议名称模板、参会人员等参数提取为 JSON 配置文件
   - 一套脚本支持多个部门的周例会创建
4. **执行历史**: 记录每次执行的会议名称、时间、成功/失败状态
   - 使用 GM_setValue 存储历史记录，方便追踪和排错
5. **定时任务**: 结合浏览器计划任务或外部调度器实现定时自动执行
   - 需要 OA 页面保持打开或使用 Service Worker 后台运行

---

*文档最后更新: 2026-09-17*
*脚本版本: v1.1.1（完整功能） / v0.2.0（技术验证）*
*测试状态: 待正式环境验证*
